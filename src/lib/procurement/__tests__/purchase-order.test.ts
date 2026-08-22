import { describe, expect, test } from "vitest";
import {
  canCreatePurchaseOrder,
  financialYear,
  formatPoNumber,
  initialSequenceNumber,
  isIntraState,
  poTotals,
  rupeesInWords,
} from "../purchase-order";

describe("financial year", () => {
  test("runs April to March, in IST", () => {
    expect(financialYear(new Date("2026-08-20T00:00:00Z"))).toBe("26-27");
    expect(financialYear(new Date("2026-03-31T23:00:00+05:30"))).toBe("25-26");
    // 05:00 UTC on 1 April is already 10:30 the same day in IST.
    expect(financialYear(new Date("2026-04-01T05:00:00Z"))).toBe("26-27");
    // 20:00 UTC on 31 March is 01:30 on 1 April in IST - the new year.
    expect(financialYear(new Date("2026-03-31T20:00:00Z"))).toBe("26-27");
  });
});

describe("PO numbering", () => {
  test("formats as entity / financial year / four digits", () => {
    expect(formatPoNumber("WT", "26-27", 63)).toBe("WT/26-27/0063");
    expect(formatPoNumber("PL", "26-27", 1)).toBe("PL/26-27/0001");
  });

  test("each entity keeps its own series, seeded then restarting each year", () => {
    expect(initialSequenceNumber("WT", "26-27")).toBe(64);
    expect(initialSequenceNumber("PL", "26-27")).toBe(1);
    expect(initialSequenceNumber("WT", "27-28")).toBe(1);
  });
});

describe("totals", () => {
  // The numbers on WT/26-27/0063: seven lines, the jumper wire nil-rated.
  const items = [
    { quantity: 1, rate: 55000, taxPercent: 18 },
    { quantity: 8, rate: 11000, taxPercent: 18 },
    { quantity: 2, rate: 6000, taxPercent: 18 },
    { quantity: 1, rate: 8000, taxPercent: 18 },
    { quantity: 10, rate: 2000, taxPercent: 18 },
    { quantity: 5, rate: 4000, taxPercent: 18 },
    { quantity: 30, rate: 166, taxPercent: 0 },
  ];

  test("splits CGST and SGST in state and rounds the grand total to the rupee", () => {
    const totals = poTotals(items, true);

    expect(totals.subtotal).toBe(207_980);
    expect(totals.cgst).toBe(18_270);
    expect(totals.sgst).toBe(18_270);
    expect(totals.igst).toBe(0);
    expect(totals.roundOff).toBe(-20);
    expect(totals.grandTotal).toBe(244_500);
  });

  test("charges the whole rate as IGST out of state", () => {
    const totals = poTotals(items, false);

    expect(totals.cgst).toBe(0);
    expect(totals.igst).toBe(36_540);
    expect(totals.grandTotal).toBe(244_500);
  });

  test("groups tax by rate so mixed-rate lines each get their own row", () => {
    const totals = poTotals(
      [
        { quantity: 1, rate: 10_000, taxPercent: 18 },
        { quantity: 1, rate: 10_000, taxPercent: 5 },
      ],
      true
    );

    expect(totals.taxRows).toEqual([
      { percent: 5, amount: 500, half: 250 },
      { percent: 18, amount: 1_800, half: 900 },
    ]);
  });
});

describe("state of supply", () => {
  test("matching GSTIN state codes are intra-state; an unregistered vendor defaults to it", () => {
    expect(isIntraState("29AAECW4792Q1Z8", "29LVJPS1915F1Z2")).toBe(true);
    expect(isIntraState("29AAECW4792Q1Z8", "27LVJPS1915F1Z2")).toBe(false);
    expect(isIntraState("29AAECW4792Q1Z8", null)).toBe(true);
  });
});

describe("amount in words", () => {
  test("reads back in the Indian system", () => {
    expect(rupeesInWords(244_500)).toBe("Rupees Two Thousand Four Hundred Forty Five Only");
    expect(rupeesInWords(0)).toBe("Rupees Zero Only");
    expect(rupeesInWords(1_50_00_000_00)).toBe("Rupees One Crore Fifty Lakh Only");
  });
});

describe("who may raise a PO", () => {
  test("only the accounts login", () => {
    expect(canCreatePurchaseOrder("accounts@thewhitetusker.com")).toBe(true);
    expect(canCreatePurchaseOrder("Accounts@TheWhiteTusker.com ")).toBe(true);
    expect(canCreatePurchaseOrder("suman@thewhitetusker.com")).toBe(false);
    expect(canCreatePurchaseOrder(null)).toBe(false);
  });
});
