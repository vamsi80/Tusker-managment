import { describe, it, expect, vi, beforeEach } from "vitest";

const error = vi.fn();
const dismiss = vi.fn();
vi.mock("sonner", () => {
  const base = vi.fn();
  return { toast: Object.assign(base, { error, dismiss }) };
});

const { toast } = await import("../toast");

/**
 * Handing sonner an object throws "Objects are not valid as a React child"
 * mid-render and kills the page, so nothing unrenderable may reach it.
 */
describe("toast guard", () => {
  // `await res.json()` is `any`, so these reach toast untyped at runtime.
  const fromApi = (value: unknown) => value as string;

  beforeEach(() => error.mockClear());

  it("passes strings through untouched", () => {
    toast.error("Vendor Name is required");
    expect(error).toHaveBeenCalledWith("Vendor Name is required");
  });

  it("unwraps an object error into its message", () => {
    toast.error(fromApi({ name: "ZodError", message: "gstNumber: Invalid GST Format" }));
    expect(error).toHaveBeenCalledWith("gstNumber: Invalid GST Format");
  });

  it("stringifies an object with no message", () => {
    toast.error(fromApi({ issues: 2 }));
    expect(error).toHaveBeenCalledWith('{"issues":2}');
  });

  it("forwards the options argument", () => {
    toast.error("boom", { duration: 5000 });
    expect(error).toHaveBeenCalledWith("boom", { duration: 5000 });
  });

  it("keeps sonner's non-message methods", () => {
    toast.dismiss("id");
    expect(dismiss).toHaveBeenCalledWith("id");
  });
});
