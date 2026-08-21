/**
 * Matches scanned quotation rows onto line items that already exist on an indent.
 *
 * Deliberately conservative: an unmatched row is left blank for the user to fill,
 * because a rate written against the wrong material is worse than a missing one.
 */

export type ScannedItem = {
  materialName: string;
  unit: string | null;
  quantity: number | null;
  /** Rupees. Both forms convert to paise on submit; this must not pre-convert. */
  unitPrice: number | null;
};

const normalize = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

export function matchByMaterialName<T extends { materialName: string }>(
  scanned: T[],
  lineItems: { id: string; materialName: string }[]
): Map<string, T> {
  const matched = new Map<string, T>();
  const used = new Set<T>();

  const take = (predicate: (scannedName: string, itemName: string) => boolean) => {
    for (const item of lineItems) {
      if (matched.has(item.id)) continue;
      const itemName = normalize(item.materialName);
      if (!itemName) continue;
      const hit = scanned.find((row) => {
        if (used.has(row)) return false;
        const rowName = normalize(row.materialName);
        return Boolean(rowName) && predicate(rowName, itemName);
      });
      if (hit) {
        matched.set(item.id, hit);
        used.add(hit);
      }
    }
  };

  // Exact names win outright, so a loose containment match can never steal a row
  // that belongs precisely to another line item.
  take((a, b) => a === b);
  take((a, b) => a.includes(b) || b.includes(a));

  return matched;
}

/** Rows a quotation always carries that are not materials. */
const NON_ITEM_ROW =
  /^(sub\s*-?\s*total|total|grand\s*total|net\s*(amount|total)|amount\s*in\s*words|gst|cgst|sgst|igst|vat|tax|freight|transport|labour|labor|discount|round\s*-?\s*off|advance|balance|terms|note|remarks?|thank)/i;

/** "₹ 1,250.50" / "Rs.1250" / "1,25,000" → a plain number. */
export function toNumber(raw: unknown): number | null {
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : null;
  if (typeof raw !== "string") return null;
  // Currency prefixes are removed before digits are hunted: stripping by character
  // class instead would leave the dot in "Rs." behind and read it as a decimal point.
  const match = raw.replace(/(?:rs\.?|inr|₹)/gi, " ").match(/-?\d[\d,]*(?:\.\d+)?/);
  if (!match) return null;
  const n = Number.parseFloat(match[0].replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}

const normalizeVendorName = (s: string) =>
  s
    .toLowerCase()
    .replace(/\b(pvt|private|ltd|limited|llp|inc|corp|co)\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

/**
 * Deliberately conservative: a wrong vendor on a purchase order is worse than an
 * empty dropdown the user fills in themselves.
 */
export function matchVendor(
  extracted: string | null,
  vendors: { id: string; name: string; companyName: string | null }[]
): string | null {
  if (!extracted) return null;
  const needle = normalizeVendorName(extracted);
  if (needle.length < 4) return null;

  for (const vendor of vendors) {
    for (const candidate of [vendor.companyName, vendor.name]) {
      if (!candidate) continue;
      const hay = normalizeVendorName(candidate);
      if (!hay) continue;
      if (hay === needle) return vendor.id;
      if (hay.length >= 4 && (hay.includes(needle) || needle.includes(hay))) return vendor.id;
    }
  }
  return null;
}

/** Keeps "MTR" and "Metre" from becoming a unit the dropdowns cannot show. */
export function matchUnit(raw: string | null, units: { abbreviation: string; name: string }[]): string | null {
  if (!raw) return null;
  const needle = raw.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (!needle) return null;
  for (const unit of units) {
    if (unit.abbreviation.toLowerCase().replace(/[^a-z0-9]/g, "") === needle) return unit.abbreviation;
    if (unit.name.toLowerCase().replace(/[^a-z0-9]/g, "") === needle) return unit.abbreviation;
  }
  return raw.trim() || null;
}

/** Drops blanks and the total/tax rows every quotation ends with. */
export function cleanItems(items: ScannedItem[]): ScannedItem[] {
  return items.filter((item) => {
    const name = (item.materialName || "").trim();
    if (name.length < 2) return false;
    if (NON_ITEM_ROW.test(name)) return false;
    // A row with neither a rate nor a quantity carries no information worth prefilling.
    return item.unitPrice !== null || item.quantity !== null;
  });
}
