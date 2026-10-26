import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import * as FileSystem from "expo-file-system/legacy";
import { API_BASE } from "../api/client";
import { BUYER_COMPANIES, poTotals, rupeesInWords, type CompanyCode } from "./purchase-order";
import { formatPaise } from "./format";

const LOGOS: Record<CompanyCode, string> = { WT: "/logo-white-tusker.png", PL: "/logo-lattice-lane.png" };
const TABLE_ROW_BUDGET = 30;

const esc = (s: unknown) =>
    String(s ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");

/** The vendor's structured address, else the legacy single line (pos/[poId]/page.tsx addressLines). */
export const vendorAddressLines = (v: any) => {
    const structured = [v.addressLine1, v.addressLine2, [v.city, v.state, v.pincode].filter(Boolean).join(", ")].filter((l) => l?.trim());
    return [v.companyName || v.name, ...(structured.length ? structured : [v.address])].filter((l): l is string => !!l?.trim());
};

/** Same totals rows the web document prints under the items. */
export function poTotalRows(po: any) {
    const { taxRows, chargeRows } = poTotals(po.items, po.intraState, {
        exciseDutyPercent: po.exciseDutyPercent ? Number(po.exciseDutyPercent) : null,
        vatPercent: po.vatPercent ? Number(po.vatPercent) : null,
        transportCharge: po.transportCharge,
        labourCharge: po.labourCharge,
    });
    return [
        { label: "SUB TOTAL", value: po.subtotal, bold: true },
        ...chargeRows.map((r) => ({ ...r, bold: false })),
        ...taxRows.flatMap((r) =>
            po.intraState
                ? [
                      { label: `CGST @ ${r.percent / 2}%`, value: r.half, bold: false },
                      { label: `SGST @ ${r.percent / 2}%`, value: r.half, bold: false },
                  ]
                : [{ label: `IGST @ ${r.percent}%`, value: r.amount, bold: false }],
        ),
        ...(po.roundOff !== 0 ? [{ label: "Round Off", value: po.roundOff, bold: false }] : []),
        { label: "GRAND TOTAL", value: po.grandTotal, bold: true },
    ];
}

/** HTML of the printed PO — one A4 sheet, matching the web's #po-document. */
export function poHtml(po: any) {
    const buyer = BUYER_COMPANIES[po.company as CompanyCode];
    const totals = poTotalRows(po);
    const filler = Math.max(0, TABLE_ROW_BUDGET - po.items.length - totals.length);
    const cell = "border:1px solid #a3a3a3;padding:3px 4px;";
    const origin = new URL(API_BASE).origin;
    return `<!doctype html><html><head><meta charset="utf-8"/><style>
@page{size:A4 portrait;margin:8mm}
body{font-family:-apple-system,Helvetica,Arial,sans-serif;font-size:11px;color:#000;margin:0}
.doc{border:1px solid #a3a3a3;padding:18px}
.head{display:flex;justify-content:space-between;align-items:flex-end;border-bottom:1px solid #a3a3a3;padding-bottom:10px}
.head img{width:46mm;filter:grayscale(1)}
h1{font-weight:300;font-size:24px;margin:0}
.grid{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;border-bottom:1px solid #a3a3a3;padding:10px 0}
.grid p{margin:0 0 2px}
table{width:100%;border-collapse:collapse}
th{${cell}text-align:center}
td{${cell}}
.r{text-align:right}.c{text-align:center}
.box{border:1px solid #a3a3a3;border-top:0;padding:3px 4px}
ol{margin:0;padding-left:16px;font-size:10px}
</style></head><body><div class="doc">
<div class="head"><img src="${origin}${LOGOS[po.company as CompanyCode] ?? ""}"/><h1>Purchase Order</h1></div>
<div class="grid">
<div><p><b>Invoice To:</b></p><p>${esc(buyer.name)}</p>${buyer.addressLines.map((l) => `<p>${esc(l)}</p>`).join("")}
<p>Phone No : ${esc(buyer.phone)}</p><p>Email ID : ${esc(buyer.email)}</p><p>GST No: ${esc(buyer.gstNumber)}</p>${buyer.msmeNumber ? `<p>MSME No : ${esc(buyer.msmeNumber)}</p>` : ""}</div>
<div><p><b>Delivery Address:</b></p>${String(po.deliveryAddress ?? "").split("\n").map((l) => `<p>${esc(l)}</p>`).join("")}</div>
<div><p><b>Purchase From:</b></p>${vendorAddressLines(po.vendor).map((l) => `<p>${esc(l)}</p>`).join("")}${po.vendor.gstNumber ? `<p>GSTIN: ${esc(po.vendor.gstNumber)}</p>` : ""}</div>
<div class="r"><p>DATE: ${new Date(po.poDate).toLocaleDateString("en-GB")}</p><p>PO NO : ${esc(po.poNumber)}</p>${po.referenceNo ? `<p>Reference No: ${esc(po.referenceNo)}</p>` : ""}</div>
</div>
<table><thead><tr><th style="width:44px">SR NO</th><th>DESCRIPTION</th><th style="width:70px">Quantity</th><th style="width:56px">Unit</th><th style="width:90px">RATE</th><th style="width:100px">AMOUNT</th></tr></thead><tbody>
${po.items.map((it: any, i: number) => `<tr><td class="c">${i + 1}</td><td>${esc(it.description)}</td><td class="c">${it.quantity}</td><td class="c">${esc(it.unit)}</td><td class="r">${formatPaise(it.rate)}</td><td class="r">${formatPaise(it.amount ?? it.quantity * it.rate)}</td></tr>`).join("")}
${Array.from({ length: filler }).map(() => `<tr><td>&nbsp;</td><td></td><td></td><td></td><td></td><td></td></tr>`).join("")}
${totals.map((r) => `<tr><td colspan="4" style="border:0"></td><td class="r"${r.bold ? ' style="font-weight:700"' : ""}>${r.label}</td><td class="r"${r.bold ? ' style="font-weight:700"' : ""}>${formatPaise(r.value)}</td></tr>`).join("")}
</tbody></table>
<div class="box"><b>IN WORDS</b><span style="margin-left:24px">${rupeesInWords(po.grandTotal)}</span></div>
<div class="box r"><b>PAYMENTS TERMS &amp; CONDITIONS</b></div>
<div class="box"><ol>${(po.terms ?? []).map((t: string) => `<li>${esc(t)}</li>`).join("")}</ol></div>
<div class="box">Thank You</div>
</div></body></html>`;
}

export async function sharePoPdf(po: any) {
    const { uri: printed } = await Print.printToFileAsync({ html: poHtml(po), width: 595, height: 842 });
    // expo-print names the file with a random id; share it under the PO number ("WT/26-27/0064" → "WT-26-27-0064.pdf").
    const uri = `${FileSystem.cacheDirectory}${String(po.poNumber || "purchase-order").replace(/[^\w.-]+/g, "-")}.pdf`;
    await FileSystem.deleteAsync(uri, { idempotent: true });
    await FileSystem.moveAsync({ from: printed, to: uri });
    if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(uri, { mimeType: "application/pdf", dialogTitle: `${po.poNumber}.pdf`, UTI: "com.adobe.pdf" });
}

export async function printPo(po: any) {
    await Print.printAsync({ html: poHtml(po) });
}
