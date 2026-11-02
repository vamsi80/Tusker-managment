import { describe, it, expect } from "vitest";
import { dimensionsFor, groupLines, lineTotals } from "../boq";

describe("BOQ line maths", () => {
    it("prices a cabinet typed in mm against a per-sqft rate, then marks it up", () => {
        // 1200 x 900 mm = 11.625 sqft @ Rs 1500/sqft = Rs 17,437.50, +12% markup
        const t = lineTotals({ rate: 150_000, rateUnit: "Sq. Ft", inputUnit: "mm", length: 1200, breadth: 900, markupPercent: 12 });
        expect(t.measuredQty).toBe(11.625);
        expect(t.costAmount).toBe(1_743_750);
        expect(t.amount).toBe(1_953_000);
    });

    it("needs no conversion when dimensions share the rate's unit", () => {
        expect(lineTotals({ rate: 10_000, rateUnit: "sqft", inputUnit: "ft", length: 4, breadth: 2 }).measuredQty).toBe(8);
    });

    it("handles running length, volume and plain counts", () => {
        expect(lineTotals({ rate: 20_000, rateUnit: "RFT", inputUnit: "mm", length: 3000 }).costAmount).toBe(196_850);
        expect(lineTotals({ rate: 500_000, rateUnit: "cum", inputUnit: "m", length: 1, breadth: 1, depth: 0.1 }).costAmount).toBe(50_000);
        // a count unit ignores any dimensions it is given
        expect(lineTotals({ rate: 50_000, rateUnit: "nos", length: 999, quantity: 4 }).costAmount).toBe(200_000);
        expect(lineTotals({ rate: 50_000, rateUnit: "Job", quantity: 1 }).costAmount).toBe(50_000);
    });

    it("multiplies by quantity on top of dimensions", () => {
        expect(lineTotals({ rate: 10_000, rateUnit: "sqft", inputUnit: "ft", length: 2, breadth: 2, quantity: 3 }).measuredQty).toBe(12);
    });

    it("asks only for the dimensions the unit needs", () => {
        expect(dimensionsFor("nos")).toEqual({ length: false, breadth: false, depth: false });
        expect(dimensionsFor("rmt")).toEqual({ length: true, breadth: false, depth: false });
        expect(dimensionsFor("sqm")).toEqual({ length: true, breadth: true, depth: false });
        expect(dimensionsFor("CFT")).toEqual({ length: true, breadth: true, depth: true });
    });

    it("groups lines with subtotals in first-seen order", () => {
        const groups = groupLines(
            [
                { zone: "Reception", costAmount: 100, amount: 110 },
                { zone: "Room A", costAmount: 50, amount: 60 },
                { zone: "Reception", costAmount: 10, amount: 11 },
            ],
            (l) => l.zone
        );
        expect(groups.map((g) => [g.key, g.costAmount, g.amount])).toEqual([
            ["Reception", 110, 121],
            ["Room A", 50, 60],
        ]);
    });
});
