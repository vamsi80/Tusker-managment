/**
 * BOQ line maths. Pure, shared by the API (which always recomputes before
 * saving) and the web form (live preview), so the two can never disagree.
 *
 * A rate is quoted per some unit: per nos, per running ft, per sqft, per cum...
 * The unit decides how many dimensions a line needs (0-3) and how big one unit
 * is, so dimensions typed in any length unit are converted before multiplying:
 *   measuredQty = quantity x (L x B x D, each converted to the rate's side length)
 * Money is paise, matching the rest of procurement.
 */

/** Length units a dimension can be typed in, as metres. */
export const LENGTH_UNITS = {
    mm: 0.001,
    cm: 0.01,
    m: 1,
    in: 0.0254,
    ft: 0.3048,
} as const;

export type LengthUnit = keyof typeof LENGTH_UNITS;

export const LENGTH_UNIT_OPTIONS = (Object.keys(LENGTH_UNITS) as LengthUnit[]).map((value) => ({
    value,
    label: value,
}));

type RateMeasure = { dims: 0 | 1 | 2 | 3; side: number };

// Side length in metres of one unit square/cube, keyed by normalised unit text.
const LENGTH: Record<string, number> = {
    mm: 0.001, cm: 0.01, m: 1, mtr: 1, metre: 1, meter: 1, rm: 1, rmt: 1, rmtr: 1, lm: 1,
    in: 0.0254, inch: 0.0254, ft: 0.3048, feet: 0.3048, rft: 0.3048, rf: 0.3048, lft: 0.3048,
};
const AREA: Record<string, number> = {
    sqmm: 0.001, sqcm: 0.01, sqm: 1, sqmt: 1, sqmtr: 1, m2: 1, smt: 1,
    sqin: 0.0254, sqft: 0.3048, sft: 0.3048, ft2: 0.3048,
};
const VOLUME: Record<string, number> = {
    cum: 1, cumtr: 1, cbm: 1, m3: 1, cft: 0.3048, cuft: 0.3048, ft3: 0.3048,
    ltr: 0.1, l: 0.1, litre: 0.1, liter: 0.1, ml: 0.01,
};

/** "Sq. Ft", "R.M.T", "cu-m" -> "sqft", "rmt", "cum". */
const normalise = (unit: string) => unit.toLowerCase().replace(/[^a-z0-9]/g, "");

/** How a rate unit is measured. Anything unrecognised (nos, kg, set, job) is a plain count. */
export function rateMeasure(rateUnit: string | null | undefined): RateMeasure {
    const u = normalise(rateUnit ?? "");
    if (u in VOLUME) return { dims: 3, side: VOLUME[u] };
    if (u in AREA) return { dims: 2, side: AREA[u] };
    if (u in LENGTH) return { dims: 1, side: LENGTH[u] };
    return { dims: 0, side: 1 };
}

/** Which dimension inputs a line priced in `rateUnit` should ask for. */
export function dimensionsFor(rateUnit: string | null | undefined) {
    const { dims } = rateMeasure(rateUnit);
    return { length: dims >= 1, breadth: dims >= 2, depth: dims >= 3 };
}

export type BoqLineInput = {
    /** Paise per rate unit. */
    rate: number;
    rateUnit: string | null | undefined;
    inputUnit?: LengthUnit | null;
    length?: number | null;
    breadth?: number | null;
    depth?: number | null;
    quantity?: number | null;
    markupPercent?: number | null;
};

const round4 = (n: number) => Math.round(n * 10_000) / 10_000;

export function lineTotals(line: BoqLineInput) {
    const { dims, side } = rateMeasure(line.rateUnit);
    const toMetres = LENGTH_UNITS[line.inputUnit ?? "mm"] ?? LENGTH_UNITS.mm;
    const sides = [line.length, line.breadth, line.depth].slice(0, dims);

    let measured = line.quantity ?? 1;
    for (const value of sides) measured *= ((value ?? 0) * toMetres) / side;
    const measuredQty = round4(measured);

    const costAmount = Math.round(line.rate * measuredQty);
    const amount = Math.round(costAmount * (1 + (line.markupPercent ?? 0) / 100));
    return { measuredQty, costAmount, amount };
}

/** Lines grouped for the "by department" / "by zone" views, in first-seen order. */
export function groupLines<T extends { costAmount: number; amount: number }>(
    lines: T[],
    keyOf: (line: T) => string
) {
    const groups = new Map<string, { key: string; lines: T[]; costAmount: number; amount: number }>();
    for (const line of lines) {
        const key = keyOf(line);
        const group = groups.get(key) ?? { key, lines: [], costAmount: 0, amount: 0 };
        group.lines.push(line);
        group.costAmount += line.costAmount;
        group.amount += line.amount;
        groups.set(key, group);
    }
    return [...groups.values()];
}

export const BOQ_STATUSES = ["DRAFT", "SUBMITTED", "APPROVED", "REJECTED", "SUPERSEDED"] as const;
export type BoqStatus = (typeof BOQ_STATUSES)[number];

export const BOQ_STATUS_LABELS: Record<BoqStatus, string> = {
    DRAFT: "Draft",
    SUBMITTED: "Submitted",
    APPROVED: "Approved",
    REJECTED: "Rejected",
    SUPERSEDED: "Superseded",
};

/** Allowed status moves. A new revision (not a status move) is how an approved BOQ changes. */
export const BOQ_TRANSITIONS: Record<BoqStatus, BoqStatus[]> = {
    DRAFT: ["SUBMITTED"],
    SUBMITTED: ["APPROVED", "REJECTED", "DRAFT"],
    REJECTED: ["DRAFT"],
    APPROVED: [],
    SUPERSEDED: [],
};

export const VENDOR_VERIFICATION = ["PENDING", "VERIFIED"] as const;
export type VendorVerification = (typeof VENDOR_VERIFICATION)[number];
