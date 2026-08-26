import { describe, expect, test } from "vitest";
import { approveActionLabel } from "../status-filters";

describe("approve button label", () => {
  test("the first pass only sends the indent out for estimates", () => {
    for (const status of [
      "SUBMITTED",
      "ASSIGNED",
      "PENDING_OWNER_APPROVAL",
      "PENDING_OWNER_COMPARATIVE_APPROVAL",
    ]) {
      expect(approveActionLabel(status)).toBe("Proceed for Gathering Estimates");
    }
  });

  test("manager and owner sign off the final rates with the same wording", () => {
    expect(approveActionLabel("PENDING_MANAGER_FINAL_RATE_APPROVAL")).toBe("Approve Final Rates");
    expect(approveActionLabel("PENDING_OWNER_FINAL_APPROVAL")).toBe("Approve Final Rates");
  });
});
