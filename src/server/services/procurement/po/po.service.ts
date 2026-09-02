import prisma from "@/lib/db";
import { AppError } from "@/lib/errors/app-error";
import {
  BUYER_COMPANIES,
  canCreatePurchaseOrder,
  financialYear,
  formatPoNumber,
  initialSequenceNumber,
  isBuyerConfigured,
  isIntraState,
  poTotals,
  PO_TERMS,
  type CompanyCode,
} from "@/lib/procurement/purchase-order";

export type CreatePurchaseOrderInput = {
  workspaceId: string;
  company: CompanyCode;
  vendorId: string;
  indentId: string;
  referenceNo?: string | null;
  poDate?: Date;
  deliveryAddress: string;
  // Extras carried over from the indent, printed under the subtotal.
  exciseDutyPercent?: number | null;
  vatPercent?: number | null;
  transportCharge?: number | null;
  labourCharge?: number | null;
  // One line per term. Empty falls back to the standard set.
  terms?: string[];
  notes?: string | null;
  items: {
    description: string;
    unit: string;
    quantity: number;
    rate: number;
    taxPercent: number;
  }[];
};

const poInclude = {
  items: { orderBy: { sortOrder: "asc" } },
  vendor: true,
  indent: { select: { id: true, indentId: true, name: true } },
  createdBy: { select: { user: { select: { name: true, surname: true, email: true } } } },
} as const;

export class PurchaseOrderService {
  /**
   * Raising a PO commits the company to money, so it is restricted to the
   * accounts login. Checked here rather than only in the UI - the API is the
   * trust boundary.
   */
  static assertCanCreate(email?: string | null, workspaceRole?: string | null) {
    if (!canCreatePurchaseOrder(email, workspaceRole)) {
      throw AppError.Forbidden(
        "Only the accounts login or a workspace owner may raise purchase orders"
      );
    }
  }

  /**
   * Refuse to issue a PO for an entity whose printed details are still blank -
   * it would go out with no address and no GSTIN, which is not a valid tax
   * document. Fill the entity in at BUYER_COMPANIES to enable it.
   */
  static assertBuyerConfigured(company: CompanyCode) {
    if (!isBuyerConfigured(company)) {
      throw AppError.ValidationError(
        `${BUYER_COMPANIES[company].name} has no registered address or GSTIN configured yet, so a purchase order cannot be raised for it.`
      );
    }
  }

  static list(workspaceId: string) {
    return prisma.purchaseOrder.findMany({
      where: { workspaceId },
      include: {
        vendor: { select: { id: true, name: true, companyName: true } },
        indent: { select: { id: true, indentId: true, name: true } },
        _count: { select: { items: true } },
      },
      orderBy: { createdAt: "desc" },
    });
  }

  static async get(id: string, workspaceId: string) {
    const po = await prisma.purchaseOrder.findFirst({
      where: { id, workspaceId },
      include: poInclude,
    });
    if (!po) throw AppError.NotFound("Purchase order not found");
    return po;
  }

  static async create(input: CreatePurchaseOrderInput, userId: string) {
    const { workspaceId, company } = input;

    const member = await prisma.workspaceMember.findUnique({
      where: { userId_workspaceId: { userId, workspaceId } },
      select: { id: true },
    });
    if (!member) throw AppError.Forbidden("Not a workspace member");

    const vendor = await prisma.vendor.findFirst({
      where: { id: input.vendorId, workspaceId },
      select: { id: true, gstNumber: true },
    });
    if (!vendor) throw AppError.NotFound("Vendor not found");

    const indent = await prisma.indent.findFirst({
      where: { id: input.indentId, workspaceId },
      select: { id: true, status: true },
    });
    if (!indent) throw AppError.NotFound("Indent not found");
    if (indent.status !== "APPROVED") {
      throw AppError.Conflict("A purchase order can only be created from an approved indent");
    }

    if (!input.items.length) throw AppError.ValidationError("Add at least one line item");

    const buyer = BUYER_COMPANIES[company];
    if (!buyer.gstNumber) {
      throw AppError.ValidationError(
        `${buyer.name} has no GSTIN configured yet - add it before raising a PO`
      );
    }

    // Totals are recomputed from quantity and rate here; whatever the browser
    // showed is only a preview.
    const intraState = isIntraState(buyer.gstNumber, vendor.gstNumber);
    const totals = poTotals(input.items, intraState, {
      exciseDutyPercent: input.exciseDutyPercent,
      vatPercent: input.vatPercent,
      transportCharge: input.transportCharge,
      labourCharge: input.labourCharge,
    });
    const poDate = input.poDate ?? new Date();
    const fy = financialYear(poDate);

    return prisma.$transaction(async (tx) => {
      const counter = await tx.poSequence.upsert({
        where: {
          workspaceId_company_financialYear: { workspaceId, company, financialYear: fy },
        },
        create: {
          workspaceId,
          company,
          financialYear: fy,
          next: initialSequenceNumber(company, fy) + 1,
        },
        update: { next: { increment: 1 } },
        select: { next: true },
      });

      return tx.purchaseOrder.create({
        data: {
          workspaceId,
          poNumber: formatPoNumber(company, fy, counter.next - 1),
          company,
          financialYear: fy,
          vendorId: vendor.id,
          indentId: input.indentId,
          referenceNo: input.referenceNo ?? null,
          poDate,
          deliveryAddress: input.deliveryAddress,
          terms: input.terms?.length ? input.terms : PO_TERMS,
          notes: input.notes ?? null,
          intraState,
          subtotal: totals.subtotal,
          exciseDutyPercent: input.exciseDutyPercent ?? null,
          vatPercent: input.vatPercent ?? null,
          transportCharge: totals.transportCharge,
          labourCharge: totals.labourCharge,
          cgst: totals.cgst,
          sgst: totals.sgst,
          igst: totals.igst,
          roundOff: totals.roundOff,
          grandTotal: totals.grandTotal,
          createdById: member.id,
          items: {
            create: totals.lines.map((line, index) => ({
              description: input.items[index].description,
              unit: input.items[index].unit,
              quantity: line.quantity,
              rate: line.rate,
              amount: line.amount,
              taxPercent: line.taxPercent,
              sortOrder: index,
            })),
          },
        },
        include: poInclude,
      });
    });
  }
}
