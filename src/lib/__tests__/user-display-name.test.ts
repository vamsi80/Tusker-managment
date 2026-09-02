import { describe, expect, it } from "vitest";
import { getUserDisplayInitial, getUserDisplayName } from "@/lib/user-display-name";

describe("user display name", () => {
  it("uses the nickname instead of the full name", () => {
    expect(getUserDisplayName({ name: "Arjun Kumar", surname: "AJ" })).toBe("AJ");
  });

  it("falls back for legacy users without a nickname", () => {
    expect(getUserDisplayName({ name: "Arjun Kumar", surname: " " })).toBe("Arjun Kumar");
    expect(getUserDisplayName({ email: "arjun@example.com" })).toBe("arjun");
    expect(getUserDisplayName(null, "Unknown user")).toBe("Unknown user");
  });

  it("builds initials from the displayed nickname", () => {
    expect(getUserDisplayInitial({ name: "Arjun Kumar", surname: "aj" })).toBe("A");
  });
});
