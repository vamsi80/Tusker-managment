/**
 * Purchase order maths, and the two entities that issue them.
 *
 * Shared by the create form, the API and the printed document, so the totals a
 * user previews are the totals that get saved. All money is paise, matching
 * indent line items.
 */

export type CompanyCode = "WT" | "PL";

export type BuyerCompany = {
  code: CompanyCode;
  name: string;
  addressLines: string[];
  phone: string;
  email: string;
  gstNumber: string;
  /**
   * Where this entity's numbering picks up, so generated POs continue the
   * series issued by hand. Any other financial year starts at 1.
   */
  seed: { financialYear: string; nextNumber: number };
};

export const BUYER_COMPANIES: Record<CompanyCode, BuyerCompany> = {
  WT: {
    code: "WT",
    name: "White Tusker Private Limited",
    addressLines: [
      "#1331, 10th Main, 13th Cross,",
      "Eshwara Layout, Indiranagar,",
      "Bangalore - 560038",
    ],
    phone: "+91 99001 10689",
    email: "accounts@thewhitetusker.com",
    gstNumber: "29AAECW4792Q1Z8",
    // WT/26-27/0063 was the last one raised by hand.
    seed: { financialYear: "26-27", nextNumber: 64 },
  },
  PL: {
    code: "PL",
    name: "Palm Length LLP",
    // TODO: fill in Palm Length's registered address, phone, email and GSTIN -
    // they print on every PO this entity issues.
    addressLines: [],
    phone: "",
    email: "",
    gstNumber: "",
    seed: { financialYear: "26-27", nextNumber: 1 },
  },
};

/** Only this account may raise purchase orders. */
export const PO_CREATOR_EMAIL = "accounts@thewhitetusker.com";

export const canCreatePurchaseOrder = (email?: string | null) =>
  email?.trim().toLowerCase() === PO_CREATOR_EMAIL;

/** Financial year of a date in IST (April - March), as "26-27". */
export function financialYear(date: Date) {
  const [year, month] = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
  })
    .format(date)
    .split("-")
    .map(Number);

  const start = month >= 4 ? year : year - 1;
  const yy = (value: number) => String(value % 100).padStart(2, "0");
  return `${yy(start)}-${yy(start + 1)}`;
}

export const formatPoNumber = (company: CompanyCode, fy: string, sequence: number) =>
  `${company}/${fy}/${String(sequence).padStart(4, "0")}`;

/** First number a fresh (company, financial year) counter hands out. */
export const initialSequenceNumber = (company: CompanyCode, fy: string) => {
  const { seed } = BUYER_COMPANIES[company];
  return seed.financialYear === fy ? seed.nextNumber : 1;
};

export type PoItemInput = { quantity: number; rate: number; taxPercent: number };

/**
 * Line amounts, GST grouped by rate, and a grand total rounded to the rupee.
 * Intra-state splits the rate into equal CGST and SGST halves; inter-state
 * charges the whole thing as IGST.
 */
export function poTotals<T extends PoItemInput>(items: T[], intraState: boolean) {
  const lines = items.map((item) => ({ ...item, amount: item.quantity * item.rate }));
  const subtotal = lines.reduce((total, line) => total + line.amount, 0);

  const baseByRate = new Map<number, number>();
  for (const line of lines) {
    if (line.taxPercent > 0) {
      baseByRate.set(line.taxPercent, (baseByRate.get(line.taxPercent) ?? 0) + line.amount);
    }
  }

  const taxRows = [...baseByRate.entries()]
    .sort(([a], [b]) => a - b)
    .map(([percent, base]) => ({
      percent,
      amount: Math.round((base * percent) / 100),
      half: Math.round((base * percent) / 200),
    }));

  const cgst = intraState ? taxRows.reduce((total, row) => total + row.half, 0) : 0;
  const igst = intraState ? 0 : taxRows.reduce((total, row) => total + row.amount, 0);
  const exact = subtotal + cgst * 2 + igst;
  const grandTotal = Math.round(exact / 100) * 100;

  return {
    lines,
    subtotal,
    taxRows,
    cgst,
    sgst: cgst,
    igst,
    roundOff: grandTotal - exact,
    grandTotal,
  };
}

/** Same state code in both GSTINs means CGST + SGST. */
export const isIntraState = (buyerGstin: string, vendorGstin?: string | null) =>
  !vendorGstin?.trim() || vendorGstin.slice(0, 2) === buyerGstin.slice(0, 2);

export const formatPaise = (paise: number) =>
  `${paise < 0 ? "-" : ""}₹${(Math.abs(paise) / 100).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

const ONES = [
  "", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten",
  "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen",
  "Eighteen", "Nineteen",
];
const TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

const words = (n: number): string => {
  if (n < 20) return ONES[n];
  if (n < 100) return `${TENS[Math.floor(n / 10)]}${n % 10 ? ` ${ONES[n % 10]}` : ""}`;
  const [divisor, label] =
    n < 1_000 ? [100, "Hundred"]
      : n < 100_000 ? [1_000, "Thousand"]
        : n < 10_000_000 ? [100_000, "Lakh"]
          : [10_000_000, "Crore"];
  const rest = n % divisor;
  return `${words(Math.floor(n / divisor))} ${label}${rest ? ` ${words(rest)}` : ""}`;
};

/** "Rupees Two Thousand Four Hundred Forty Five Only" - paise are rounded off. */
export const rupeesInWords = (paise: number) =>
  `Rupees ${words(Math.round(paise / 100)) || "Zero"} Only`;

/** Boilerplate printed under every PO. */
export const PO_TERMS = [
  "Payment terms: Credit Period - 21 days from invoice date.",
  "Spec Non-Compliance: Any goods deviating from the approved specifications/samples will be rejected outright; Vendor must replace them at their own cost.",
  "Quality Guarantee: Any defects or quality issues discovered after delivery or during installation must be rectified or replaced by the Vendor immediately at no extra cost to the Buyer.",
  "Transit Damage: The Vendor is 100% liable for damages during transport; all damaged items must be replaced with new units at the Vendor's expense (including freight).",
  "Right to Offset: The Buyer reserves the right to deduct any accrued penalties or replacement costs directly from the Vendor's pending invoices.",
  "GST amount will be paid only after GSTR-1 is filed and the invoice reflects in GSTR-2B.",
];
