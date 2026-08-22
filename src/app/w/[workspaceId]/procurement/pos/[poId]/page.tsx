import { notFound } from "next/navigation";
import Link from "next/link";
import { requireUser } from "@/lib/auth/require-user";
import prisma from "@/lib/db";
import { Button } from "@/components/ui/button";
import {
  BUYER_COMPANIES,
  formatPaise,
  poTotals,
  rupeesInWords,
} from "@/lib/procurement/purchase-order";
import { PrintButton } from "../_components/print-button";

interface PageProps {
  params: Promise<{ workspaceId: string; poId: string }>;
}

/** Structured address if the vendor has one, else the legacy single-line field. */
const addressLines = (vendor: {
  companyName: string | null;
  name: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  state: string | null;
  pincode: string | null;
  address: string | null;
}) => {
  const structured = [
    vendor.addressLine1,
    vendor.addressLine2,
    [vendor.city, vendor.state, vendor.pincode].filter(Boolean).join(", "),
  ].filter((line) => line?.trim());

  return [vendor.companyName || vendor.name, ...(structured.length ? structured : [vendor.address])]
    .filter((line): line is string => Boolean(line?.trim()));
};

const TOTAL_CELL = "border border-neutral-400 px-1 py-1 text-right";

export default async function PurchaseOrderPage({ params }: PageProps) {
  const { workspaceId, poId } = await params;
  await requireUser();

  const po = await prisma.purchaseOrder.findFirst({
    where: { id: poId, workspaceId },
    include: { items: { orderBy: { sortOrder: "asc" } }, vendor: true },
  });

  if (!po) notFound();

  const buyer = BUYER_COMPANIES[po.company];
  // Grouping only - the money below comes from the stored columns.
  const { taxRows } = poTotals(po.items, po.intraState);

  return (
    <div className="overflow-y-auto p-4">
      <style>{`
        @media print {
          body * { visibility: hidden; }
          #po-document, #po-document * { visibility: visible; }
          #po-document { position: absolute; left: 0; top: 0; width: 100%; border: none; }
        }
      `}</style>

      <div className="mb-3 flex items-center justify-between print:hidden">
        <Button asChild variant="ghost" size="sm">
          <Link href={`/w/${workspaceId}/procurement/pos`}>Back to purchase orders</Link>
        </Button>
        <PrintButton />
      </div>

      <div
        id="po-document"
        className="mx-auto max-w-4xl border border-neutral-400 bg-white p-6 text-[11px] text-black"
      >
        <div className="flex items-end justify-between border-b border-neutral-400 pb-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-b.png" alt="" className="h-12 w-auto object-contain" />
          <h1 className="text-2xl font-light">Purchase Order</h1>
        </div>

        <div className="grid grid-cols-4 gap-3 border-b border-neutral-400 py-3">
          <div>
            <p className="font-bold">Invoice To:</p>
            <p>{buyer.name}</p>
            {buyer.addressLines.map((line) => (
              <p key={line}>{line}</p>
            ))}
            {buyer.phone && <p>Phone No : {buyer.phone}</p>}
            {buyer.email && <p>Email ID : {buyer.email}</p>}
            {buyer.gstNumber && <p>GST No: {buyer.gstNumber}</p>}
          </div>

          <div>
            <p className="font-bold">Delivery Address:</p>
            {po.deliveryAddress.split("\n").map((line, index) => (
              <p key={index}>{line}</p>
            ))}
          </div>

          <div>
            <p className="font-bold">Purchase From:</p>
            {addressLines(po.vendor).map((line, index) => (
              <p key={index}>{line}</p>
            ))}
            {po.vendor.gstNumber && <p>GSTIN: {po.vendor.gstNumber}</p>}
          </div>

          <div className="text-right">
            <p>DATE: {po.poDate.toLocaleDateString("en-GB")}</p>
            <p>PO NO : {po.poNumber}</p>
            {po.referenceNo && <p>Reference No: {po.referenceNo}</p>}
          </div>
        </div>

        <table className="w-full border-collapse">
          <thead>
            <tr className="[&>th]:border [&>th]:border-neutral-400 [&>th]:px-1 [&>th]:py-1">
              <th className="w-12">SR NO</th>
              <th>DESCRIPTION</th>
              <th className="w-20">Quantity</th>
              <th className="w-16">Unit</th>
              <th className="w-24">RATE</th>
              <th className="w-28">AMOUNT</th>
            </tr>
          </thead>
          <tbody>
            {po.items.map((item, index) => (
              <tr
                key={item.id}
                className="[&>td]:border [&>td]:border-neutral-400 [&>td]:px-1 [&>td]:py-1"
              >
                <td className="text-center">{index + 1}</td>
                <td>{item.description}</td>
                <td className="text-center">{item.quantity}</td>
                <td className="text-center">{item.unit}</td>
                <td className="text-right">{formatPaise(item.rate)}</td>
                <td className="text-right">{formatPaise(item.amount)}</td>
              </tr>
            ))}
            {[
              { label: "SUB TOTAL", value: po.subtotal, bold: true },
              ...taxRows.flatMap((row) =>
                po.intraState
                  ? [
                      { label: `CGST @ ${row.percent / 2}%`, value: row.half, bold: false },
                      { label: `SGST @ ${row.percent / 2}%`, value: row.half, bold: false },
                    ]
                  : [{ label: `IGST @ ${row.percent}%`, value: row.amount, bold: false }]
              ),
              ...(po.roundOff !== 0
                ? [{ label: "Round Off", value: po.roundOff, bold: false }]
                : []),
              { label: "GRAND TOTAL", value: po.grandTotal, bold: true },
            ].map((row) => (
              <tr key={row.label}>
                <td colSpan={4} />
                <td className={`${TOTAL_CELL} ${row.bold ? "font-bold" : ""}`}>{row.label}</td>
                <td className={`${TOTAL_CELL} ${row.bold ? "font-bold" : ""}`}>
                  {formatPaise(row.value)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="border border-t-0 border-neutral-400 px-1 py-1">
          <span className="font-bold">IN WORDS</span>
          <span className="ml-6">{rupeesInWords(po.grandTotal)}</span>
        </div>

        <div className="border border-t-0 border-neutral-400 px-1 py-1 text-right font-bold">
          PAYMENTS TERMS &amp; CONDITIONS
        </div>
        <ol className="list-inside list-decimal border border-t-0 border-neutral-400 px-1 py-1 text-[10px]">
          {po.terms.map((term) => (
            <li key={term}>{term}</li>
          ))}
        </ol>

        <div className="border border-t-0 border-neutral-400 px-1 py-1">Thank You</div>
      </div>
    </div>
  );
}
