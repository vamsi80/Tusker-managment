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
  /** Legal name, printed in the Invoice To block. This is the GST registrant. */
  name: string;
  /** Trading name, shown when picking the entity. Falls back to the legal name. */
  brand?: string;
  /**
   * Logo printed on this entity's purchase orders, served from /public.
   * Supplied as black artwork - the document greyscales it anyway, so a
   * colour variant would print flat.
   */
  logo: string;
  addressLines: string[];
  phone: string;
  email: string;
  gstNumber: string;
  /** Printed under the GST number when the entity has one. */
  msmeNumber?: string;
  /**
   * Where this entity's numbering picks up, so generated POs continue the
   * series issued by hand. Any other financial year starts at 1.
   */
  seed: { financialYear: string; nextNumber: number };
  /** Digits in the sequence: WT runs 0063, Palm Length runs 01. */
  numberPad: number;
};

export const BUYER_COMPANIES: Record<CompanyCode, BuyerCompany> = {
  WT: {
    code: "WT",
    name: "White Tusker Private Limited",
    logo: "/logo-white-tusker.png",
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
    numberPad: 4,
  },
  PL: {
    code: "PL",
    // Lattice Lane is the trading name; Palm Length LLP is the GST registrant,
    // which is what has to print in the Invoice To block.
    name: "Palm Length LLP",
    brand: "Lattice Lane",
    logo: "/logo-lattice-lane.png",
    addressLines: [
      "#1331, 10th Main, 13th Cross,",
      "Eshwara Layout, Indiranagar,",
      "Bangalore - 560038",
    ],
    phone: "+91 81975 44505",
    email: "info@latticelane.com",
    gstNumber: "29ABBFP2006K1ZB",
    msmeNumber: "KR-03-0133083",
    // PL/26-27/01 was the last one raised by hand.
    seed: { financialYear: "26-27", nextNumber: 2 },
    numberPad: 2,
  },
};

/** Name to pick the entity by: the trading name where it has one. */
export const buyerLabel = (code: CompanyCode) =>
  BUYER_COMPANIES[code].brand ?? BUYER_COMPANIES[code].name;

/**
 * A buying entity is only usable once its printed details exist - a PO with no
 * address or GSTIN is not a valid tax document.
 */
export const isBuyerConfigured = (code: CompanyCode) => {
  const buyer = BUYER_COMPANIES[code];
  return buyer.addressLines.length > 0 && buyer.gstNumber.trim() !== "";
};

/** The accounts login raises purchase orders day to day. */
export const PO_CREATOR_EMAIL = "accounts@thewhitetusker.com";

/**
 * Workspace owners can raise one too, so the flow can be exercised without
 * borrowing the accounts login. Everyone else is refused.
 */
export const canCreatePurchaseOrder = (
  email?: string | null,
  workspaceRole?: string | null,
) => workspaceRole === "OWNER" || email?.trim().toLowerCase() === PO_CREATOR_EMAIL;

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
  `${company}/${fy}/${String(sequence).padStart(BUYER_COMPANIES[company].numberPad, "0")}`;

/** First number a fresh (company, financial year) counter hands out. */
export const initialSequenceNumber = (company: CompanyCode, fy: string) => {
  const { seed } = BUYER_COMPANIES[company];
  return seed.financialYear === fy ? seed.nextNumber : 1;
};

export type PoItemInput = { quantity: number; rate: number; taxPercent: number };

/**
 * Extras carried over from the indent and printed under the subtotal.
 *
 * Percentages are a share of the subtotal and flat charges are paise, matching
 * how the indent itself totals them - the two documents have to agree or the
 * approved figure and the ordered figure drift apart.
 */
export type PoCharges = {
  transportCharge?: number | null;
  labourCharge?: number | null;
  exciseDutyPercent?: number | null;
  vatPercent?: number | null;
};

/**
 * Line amounts, GST grouped by rate, and a grand total rounded to the rupee.
 * Intra-state splits the rate into equal CGST and SGST halves; inter-state
 * charges the whole thing as IGST.
 */
export function poTotals<T extends PoItemInput>(
  items: T[],
  intraState: boolean,
  charges: PoCharges = {},
) {
  const lines = items.map((item) => ({ ...item, amount: item.quantity * item.rate }));
  const subtotal = lines.reduce((total, line) => total + line.amount, 0);

  const pct = (value?: number | null) => (Number(value) > 0 ? Number(value) : 0);
  const flat = (value?: number | null) => (Number(value) > 0 ? Math.round(Number(value)) : 0);

  const exciseDuty = Math.round((subtotal * pct(charges.exciseDutyPercent)) / 100);
  const vat = Math.round((subtotal * pct(charges.vatPercent)) / 100);
  const transportCharge = flat(charges.transportCharge);
  const labourCharge = flat(charges.labourCharge);

  // Printed in this order under SUB TOTAL, matching the indent's own breakdown.
  const chargeRows = [
    { label: `Excise Duty @ ${pct(charges.exciseDutyPercent)}%`, value: exciseDuty },
    { label: `VAT @ ${pct(charges.vatPercent)}%`, value: vat },
    { label: "Transportation", value: transportCharge },
    { label: "Labour", value: labourCharge },
  ].filter((row) => row.value > 0);

  const chargeTotal = exciseDuty + vat + transportCharge + labourCharge;

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
  const exact = subtotal + chargeTotal + cgst * 2 + igst;
  const grandTotal = Math.round(exact / 100) * 100;

  return {
    lines,
    subtotal,
    exciseDuty,
    vat,
    transportCharge,
    labourCharge,
    chargeRows,
    chargeTotal,
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
