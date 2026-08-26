import { describe, expect, test } from "vitest";
import { existsSync } from "node:fs";
import path from "node:path";
import {
  BUYER_COMPANIES,
  buyerLabel,
  canCreatePurchaseOrder,
  isBuyerConfigured,
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
  test("each entity pads its sequence the way it does on paper", () => {
    expect(formatPoNumber("WT", "26-27", 63)).toBe("WT/26-27/0063");
    expect(formatPoNumber("PL", "26-27", 1)).toBe("PL/26-27/01");
  });

  test("each entity keeps its own series, seeded then restarting each year", () => {
    expect(initialSequenceNumber("WT", "26-27")).toBe(64);
    expect(initialSequenceNumber("PL", "26-27")).toBe(2);
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

describe("indent charges under the subtotal", () => {
  const items = [{ quantity: 10, rate: 100_00, taxPercent: 18 }];

  test("no charges leaves the totals exactly as before", () => {
    const plain = poTotals(items, true);
    const empty = poTotals(items, true, {});
    expect(empty.grandTotal).toBe(plain.grandTotal);
    expect(empty.chargeRows).toEqual([]);
  });

  test("percentages are a share of the subtotal, flats are added as-is", () => {
    const totals = poTotals(items, true, {
      exciseDutyPercent: 10,
      vatPercent: 5,
      transportCharge: 500_00,
      labourCharge: 250_00,
    });

    expect(totals.subtotal).toBe(1000_00);
    expect(totals.exciseDuty).toBe(100_00);
    expect(totals.vat).toBe(50_00);
    expect(totals.transportCharge).toBe(500_00);
    expect(totals.labourCharge).toBe(250_00);
    expect(totals.chargeTotal).toBe(900_00);
  });

  test("charges reach the grand total and print in indent order", () => {
    const totals = poTotals(items, true, { vatPercent: 5, transportCharge: 500_00 });
    // 1000 subtotal + 50 VAT + 500 transport + 180 GST
    expect(totals.grandTotal).toBe(1730_00);
    expect(totals.chargeRows.map((row) => row.label)).toEqual([
      "VAT @ 5%",
      "Transportation",
    ]);
  });

  test("zero and negative charges are dropped rather than printed", () => {
    const totals = poTotals(items, true, {
      exciseDutyPercent: 0,
      vatPercent: null,
      transportCharge: -100,
      labourCharge: undefined,
    });
    expect(totals.chargeRows).toEqual([]);
    expect(totals.chargeTotal).toBe(0);
  });
});

describe("who may raise a PO", () => {
  test("the accounts login, whatever their role", () => {
    expect(canCreatePurchaseOrder("accounts@thewhitetusker.com")).toBe(true);
    expect(canCreatePurchaseOrder("Accounts@TheWhiteTusker.com ")).toBe(true);
  });

  test("a workspace owner, whatever their email", () => {
    expect(canCreatePurchaseOrder("suman@thewhitetusker.com", "OWNER")).toBe(true);
    expect(canCreatePurchaseOrder(null, "OWNER")).toBe(true);
  });

  test("nobody else", () => {
    expect(canCreatePurchaseOrder("suman@thewhitetusker.com")).toBe(false);
    expect(canCreatePurchaseOrder(null)).toBe(false);
    expect(canCreatePurchaseOrder("someone@else.com", "ADMIN")).toBe(false);
    expect(canCreatePurchaseOrder("someone@else.com", "MANAGER")).toBe(false);
    expect(canCreatePurchaseOrder("someone@else.com", "MEMBER")).toBe(false);
  });
});

describe("buying entity readiness", () => {
  test("White Tusker is ready to print", () => {
    expect(isBuyerConfigured("WT")).toBe(true);
  });

  test("Palm Length is ready to print too", () => {
    expect(isBuyerConfigured("PL")).toBe(true);
  });

  test("the document carries the legal name, the picker the trading name", () => {
    expect(BUYER_COMPANIES.PL.name).toBe("Palm Length LLP");
    expect(buyerLabel("PL")).toBe("Lattice Lane");
    // White Tusker trades under its own name, so both are the same.
    expect(buyerLabel("WT")).toBe("White Tusker Private Limited");
  });

  test("each entity prints its own mark", () => {
    expect(BUYER_COMPANIES.WT.logo).not.toBe(BUYER_COMPANIES.PL.logo);
  });

  // A missing file is a broken image on a tax document, and nothing else in the
  // stack would catch it - the page just renders an empty box.
  test("every entity's logo file actually exists in /public", () => {
    for (const entity of Object.values(BUYER_COMPANIES)) {
      const file = path.join(process.cwd(), "public", entity.logo);
      expect(existsSync(file), `${entity.name}: missing ${entity.logo}`).toBe(true);
    }
  });
});
