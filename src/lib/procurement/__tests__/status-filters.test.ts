import { describe, expect, test } from "vitest";
import { approveActionLabel } from "../status-filters";

describe("approve button label", () => {
  test("the first pass sends the indent out to get quotations", () => {
    for (const status of [
      "SUBMITTED",
      "ASSIGNED",
      "PENDING_OWNER_APPROVAL",
      "PENDING_OWNER_COMPARATIVE_APPROVAL",
    ]) {
      expect(approveActionLabel(status)).toBe("Start Getting Quotations");
    }
  });

  test("manager and owner sign off the price with the same wording", () => {
    expect(approveActionLabel("PENDING_MANAGER_FINAL_RATE_APPROVAL")).toBe("Approve Price");
    expect(approveActionLabel("PENDING_OWNER_FINAL_APPROVAL")).toBe("Approve Price");
  });
});
