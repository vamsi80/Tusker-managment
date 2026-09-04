import { describe, expect, it } from "vitest";
import { calendarDayKey, toDateOnlyString } from "@/lib/date-utils";

describe("calendarDayKey", () => {
  it("keeps a @db.Date value (midnight UTC) on its own calendar day", () => {
    // A leave taken on the 4th used to render on the 5th east of UTC, because
    // toISOString() on the grid's local-midnight cells shifted the whole grid.
    expect(calendarDayKey("2026-09-04T00:00:00.000Z")).toBe("2026-09-04");
    expect(calendarDayKey(new Date(Date.UTC(2026, 8, 4)))).toBe("2026-09-04");
  });

  it("buckets a real instant by the viewer's local day", () => {
    const localEvening = new Date(2026, 8, 4, 22, 30);
    expect(calendarDayKey(localEvening)).toBe("2026-09-04");
    expect(calendarDayKey(localEvening)).toBe(toDateOnlyString(localEvening));
  });

  it("puts a leave taken today on today's grid cell", () => {
    const today = new Date();
    const dateOnly = new Date(
      Date.UTC(today.getFullYear(), today.getMonth(), today.getDate())
    );
    expect(calendarDayKey(dateOnly)).toBe(calendarDayKey(today));
  });
});
