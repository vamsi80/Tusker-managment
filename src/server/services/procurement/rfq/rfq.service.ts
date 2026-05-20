import prisma from "@/lib/db";
import { AppError } from "@/lib/errors/app-error";

export class RFQService {
  static async sendRFQ(
    lineItemId: string,
    vendorIds: string[],
    deadline: Date,
    userId: string,
    workspaceId: string
  ) {
    const item = await prisma.indentLineItem.findUnique({
      where: { id: lineItemId },
      include: { indent: true },
    });
    if (!item) throw AppError.NotFound("Indent line item not found");
    if (item.indent.workspaceId !== workspaceId) throw AppError.Forbidden("Not allowed");

    // Transition state
    await prisma.indentLineItem.update({
      where: { id: lineItemId },
      data: {
        status: "RFQ_SENT",
        rfqSentAt: new Date(),
        rfqDeadline: deadline,
      },
    });
  }

  static async submitQuote(
    data: {
      lineItemId: string;
      vendorId: string;
      unitPrice: number;
      quantity: number;
      leadTimeDays?: number;
      validUntil?: Date;
      notes?: string;
      attachmentUrl?: string;
    },
    workspaceId: string
  ) {
    const item = await prisma.indentLineItem.findUnique({
      where: { id: data.lineItemId },
    });
    if (!item) throw AppError.NotFound("Line item not found");

    if (item.rfqDeadline && item.rfqDeadline < new Date()) {
      throw AppError.ValidationError("Quote deadline has passed");
    }

    const totalPrice = data.unitPrice * data.quantity;

    // Create quote
    const quote = await prisma.vendorQuote.upsert({
      where: {
        lineItemId_vendorId: {
          lineItemId: data.lineItemId,
          vendorId: data.vendorId,
        },
      },
      update: {
        unitPrice: data.unitPrice,
        quantity: data.quantity,
        totalPrice,
        leadTimeDays: data.leadTimeDays,
        validUntil: data.validUntil,
        notes: data.notes,
        attachmentUrl: data.attachmentUrl,
        status: "SUBMITTED",
      },
      create: {
        lineItemId: data.lineItemId,
        vendorId: data.vendorId,
        unitPrice: data.unitPrice,
        quantity: data.quantity,
        totalPrice,
        leadTimeDays: data.leadTimeDays,
        validUntil: data.validUntil,
        notes: data.notes,
        attachmentUrl: data.attachmentUrl,
        status: "SUBMITTED",
      },
    });

    // Automatically transition LineItem status to QUOTES_RECEIVED
    await prisma.indentLineItem.update({
      where: { id: data.lineItemId },
      data: { status: "QUOTES_RECEIVED" },
    });

    return quote;
  }

  static async approveQuote(quoteId: string, userId: string, workspaceId: string) {
    const quote = await prisma.vendorQuote.findUnique({
      where: { id: quoteId },
      include: { lineItem: true },
    });
    if (!quote) throw AppError.NotFound("Quote not found");

    const member = await prisma.workspaceMember.findFirst({
      where: { userId, workspaceId },
    });
    if (!member) throw AppError.Forbidden("Not a workspace member");

    const allowedRoles = ["OWNER", "ADMIN", "MANAGER", "PROCUREMENT"];
    if (!allowedRoles.includes(member.workspaceRole)) {
      throw AppError.Forbidden("Insufficient permissions to approve quotes");
    }

    await prisma.$transaction(async (tx) => {
      // 1. Approve this quote
      await tx.vendorQuote.update({
        where: { id: quoteId },
        data: {
          status: "APPROVED",
          reviewedAt: new Date(),
          reviewedById: member.id,
        },
      });

      // 2. Reject other quotes for the same line item
      await tx.vendorQuote.updateMany({
        where: {
          lineItemId: quote.lineItemId,
          id: { not: quoteId },
        },
        data: {
          status: "REJECTED",
          rejectionReason: "Another quote was approved",
          reviewedAt: new Date(),
          reviewedById: member.id,
        },
      });

      // 3. Link quote to line item and transition its status
      await tx.indentLineItem.update({
        where: { id: quote.lineItemId },
        data: {
          status: "APPROVED",
          approvedQuoteId: quoteId,
        },
      });

      // 4. Auto-upsert capability for the vendor with AUTO source
      const normalizedMaterialName = quote.lineItem.materialName.toLowerCase().trim();
      await tx.vendorMaterialCapability.upsert({
        where: {
          vendorId_materialName_serviceType: {
            vendorId: quote.vendorId,
            materialName: normalizedMaterialName,
            serviceType: "SUPPLY",
          },
        },
        update: {},
        create: {
          vendorId: quote.vendorId,
          materialName: normalizedMaterialName,
          unit: quote.lineItem.unit,
          workspaceId,
          source: "AUTO",
          serviceType: "SUPPLY",
        },
      });
    });
  }

  static async rejectQuote(quoteId: string, reason: string, userId: string, workspaceId: string) {
    const quote = await prisma.vendorQuote.findUnique({
      where: { id: quoteId },
    });
    if (!quote) throw AppError.NotFound("Quote not found");

    const member = await prisma.workspaceMember.findFirst({
      where: { userId, workspaceId },
    });
    if (!member) throw AppError.Forbidden("Not a workspace member");

    const allowedRoles = ["OWNER", "ADMIN", "MANAGER", "PROCUREMENT"];
    if (!allowedRoles.includes(member.workspaceRole)) {
      throw AppError.Forbidden("Insufficient permissions to reject quotes");
    }

    return prisma.vendorQuote.update({
      where: { id: quoteId },
      data: {
        status: "REJECTED",
        rejectionReason: reason,
        reviewedAt: new Date(),
        reviewedById: member.id,
      },
    });
  }
}
