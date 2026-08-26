import { notFound } from "next/navigation";
import Link from "next/link";
import { requireUser } from "@/lib/auth/require-user";
import prisma from "@tusker/db";
import { Button } from "@/components/ui/button";
import {
  BUYER_COMPANIES,
  formatPaise,
  poTotals,
  rupeesInWords,
} from "@tusker/core/lib/procurement/purchase-order";
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

/**
 * How many rows the printed item table holds in total - item lines, blank filler
 * and the totals block together. Holding the sum constant keeps the document one
 * A4 sheet whether or not the indent carried excise, VAT, transport and labour.
 * Lower it if the print ever spills to a second page.
 */
const TABLE_ROW_BUDGET = 30;

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
  const { taxRows, chargeRows } = poTotals(po.items, po.intraState, {
    exciseDutyPercent: po.exciseDutyPercent ? Number(po.exciseDutyPercent) : null,
    vatPercent: po.vatPercent ? Number(po.vatPercent) : null,
    transportCharge: po.transportCharge,
    labourCharge: po.labourCharge,
  });

  const totalRows = [
    { label: "SUB TOTAL", value: po.subtotal, bold: true },
    // Excise duty, VAT, transport and labour as approved on the indent.
    ...chargeRows.map((row) => ({ ...row, bold: false })),
    ...taxRows.flatMap((row) =>
      po.intraState
        ? [
            { label: `CGST @ ${row.percent / 2}%`, value: row.half, bold: false },
            { label: `SGST @ ${row.percent / 2}%`, value: row.half, bold: false },
          ]
        : [{ label: `IGST @ ${row.percent}%`, value: row.amount, bold: false }]
    ),
    ...(po.roundOff !== 0 ? [{ label: "Round Off", value: po.roundOff, bold: false }] : []),
    { label: "GRAND TOTAL", value: po.grandTotal, bold: true },
  ];

  // Blank rows take up whatever the items and totals leave, so the table is the
  // same height on every PO.
  const fillerRows = Math.max(0, TABLE_ROW_BUDGET - po.items.length - totalRows.length);

  return (
    <div className="overflow-y-auto p-4">
      <style>{`
        /* One PO, one A4 sheet. Without an explicit page box the browser applies
           its own margins and the document runs onto a second page. */
        @page { size: A4 portrait; margin: 8mm; }

        @media print {
          body * { visibility: hidden; }
          #po-document, #po-document * { visibility: visible; }

          html, body {
            width: 210mm;
            margin: 0;
            padding: 0;
            background: #fff;
          }

          #po-document {
            position: absolute;
            left: 0;
            top: 0;
            /* A4 less the page margins above. */
            width: 194mm;
            max-width: 194mm;
            border: none;
            padding: 0;
            /* Type is left exactly as on screen. The page box above is what
               makes the document fit; measured at ~225mm against 281mm usable. */
          }

          /* Keep the rules and the logo box - print defaults drop them. */
          #po-document * {
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }

          #po-document td, #po-document th {
            padding-top: 1px !important;
            padding-bottom: 1px !important;
          }

          /* A row must never be split across pages. */
          #po-document tr { page-break-inside: avoid; break-inside: avoid; }
          #po-document table { page-break-inside: auto; }
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
          {/* Each entity prints its own mark, greyscaled to match the
              reference POs. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {/* Both marks ship on a 16:9 canvas with wide margins, so they are
              sized by width - constraining the height would print them tiny. */}
          <img src={buyer.logo} alt="" className="w-[46mm] h-auto object-contain grayscale" />
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
            {buyer.msmeNumber && <p>MSME No : {buyer.msmeNumber}</p>}
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
            {Array.from({ length: fillerRows }).map(
              (_, index) => (
                <tr
                  key={`filler-${index}`}
                  className="[&>td]:border [&>td]:border-neutral-400 [&>td]:px-1 [&>td]:py-1"
                >
                  <td>&nbsp;</td>
                  <td />
                  <td />
                  <td />
                  <td />
                  <td />
                </tr>
              )
            )}
            {totalRows.map((row) => (
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
