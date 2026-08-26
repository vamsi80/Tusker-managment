import { describe, test, expect, vi } from "vitest";
import { IndentRepository } from "../indent.repository";

const nextNumber = (last: string | null) =>
  (IndentRepository as any).nextIndentNumber({
    indent: { findFirst: vi.fn(async () => (last ? { indentId: last } : null)) },
  });

describe("indent number", () => {
  test("first indent", async () => {
    expect(await nextNumber(null)).toBe("IND-0001");
  });

  test("increments the sequence", async () => {
    expect(await nextNumber("IND-0009")).toBe("IND-0010");
  });

  test("keeps counting past 9999", async () => {
    expect(await nextNumber("IND-9999")).toBe("IND-10000");
  });
});
