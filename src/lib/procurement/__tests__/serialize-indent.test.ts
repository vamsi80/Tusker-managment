import { describe, expect, it } from "vitest";
import { serializeIndentForClient } from "../serialize-indent";

describe("serializeIndentForClient", () => {
  it("converts Decimal-like percentages into serializable strings", () => {
    const indent = {
      id: "indent-1",
      taxPercent: { toString: () => "81.25" },
      exciseDutyPercent: { toString: () => "18" },
      vatPercent: null,
      lineItems: [{ id: "item-1" }],
    };

    const serialized = serializeIndentForClient(indent);

    expect(serialized).toEqual({
      id: "indent-1",
      taxPercent: "81.25",
      exciseDutyPercent: "18",
      vatPercent: null,
      lineItems: [{ id: "item-1" }],
    });
  });
});
