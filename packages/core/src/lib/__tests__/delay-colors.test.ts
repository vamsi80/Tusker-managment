import { describe, expect, it } from "vitest";
import { getDelayColors, getDelayText } from "../colors/delay-colors";

/** The label, text color family and dot style a card shows. */
const badge = (days: number | null, status = "IN_PROGRESS") => {
    const c = getDelayColors(days, status);
    return [getDelayText(days, status), c.color.split(" ")[0], c.dotVariant];
};

describe("due-date badge", () => {
    it("Review is neutral with no countdown, even when overdue", () => {
        expect(badge(1, "REVIEW")).toEqual(["In review", "text-muted-foreground", "solid"]);
        expect(badge(-5, "REVIEW")).toEqual(["In review", "text-muted-foreground", "solid"]);
    });

    it("On hold is unchanged", () => {
        expect(badge(-5, "HOLD")).toEqual(["On hold", "text-muted-foreground", "solid"]);
    });

    it("red only when due today or late", () => {
        expect(badge(-1)).toEqual(["1d delayed", "text-rose-600", "blink"]);
        expect(badge(0)).toEqual(["Due today", "text-rose-600", "solid"]);
    });

    it("amber for 1 to 3 days left, green after that", () => {
        expect(badge(1)).toEqual(["1d left", "text-orange-600", "solid"]);
        expect(badge(3)).toEqual(["3d left", "text-orange-600", "solid"]);
        expect(badge(4)).toEqual(["4d left", "text-emerald-600", "ring"]);
    });
});
