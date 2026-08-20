import { describe, test, expect, vi } from "vitest";
import { IndentRepository } from "../indent.repository";

const yy = String(new Date().getFullYear()).slice(-2);

const nextNumber = (last: string | null) =>
  (IndentRepository as any).nextIndentNumber({
    indent: { findFirst: vi.fn(async () => (last ? { indentId: last } : null)) },
  });

describe("indent number", () => {
  test("first indent of the year", async () => {
    expect(await nextNumber(null)).toBe(`${yy}0001`);
  });

  test("increments the sequence", async () => {
    expect(await nextNumber(`${yy}0009`)).toBe(`${yy}0010`);
  });

  test("keeps counting past 9999", async () => {
    expect(await nextNumber(`${yy}9999`)).toBe(`${yy}10000`);
  });
});
