import { describe, it, expect } from "vitest";
import { parseQuotationGrid, parseQuantity, isSummaryRow, detectHeader } from "../parse";
import { fieldForHeader, normalizeHeader, scoreHeaderRow } from "../columns";
import { wordsToGrid, type PositionedWord } from "../grid";
import { applySavedMapping, identifyVendor, readSavedMapping, toSavedMapping } from "../vendor";

/** A clean vendor quotation with letterhead above the table (scenario 1 + 2). */
const cleanGrid = [
  ["ABC Technologies Pvt Ltd", "", "", "", ""],
  ["GSTIN: 29ABCDE1234F1Z5", "", "", "", ""],
  ["", "", "", "", ""],
  ["QUOTATION", "", "", "", ""],
  ["Quotation No: QT-2026-1024", "", "", "", ""],
  ["Date: 20/08/2026", "", "", "", ""],
  ["", "", "", "", ""],
  ["Sl No", "Description", "Qty", "Rate", "Amount"],
  ["1", "Samsung 86 inch Display", "2", "215000", "430000"],
  ["2", "HDMI Cable", "4", "8500", "34000"],
  ["3", "Installation", "1", "25000", "25000"],
  ["", "Sub Total", "", "", "489000"],
  ["", "GST 18%", "", "", "88020"],
  ["", "Grand Total", "", "", "577020"],
];

describe("normalizeHeader / fieldForHeader", () => {
  it("compares headers regardless of case, spacing or punctuation", () => {
    for (const written of ["UNIT PRICE", "Unit Price", "unit_price", "Unit-Price", "unit  price"]) {
      expect(normalizeHeader(written), written).toBe("unit price");
      expect(fieldForHeader(written), written).toBe("unitPrice");
    }
    expect(fieldForHeader("U.O.M")).toBe("unit");
    expect(fieldForHeader("Particulars")).toBe("itemName");
    expect(fieldForHeader("Basic Rate")).toBe("unitPrice");
  });

  it("does not treat a serial column as an item name", () => {
    expect(fieldForHeader("Sl No")).toBeNull();
    expect(fieldForHeader("S.No")).toBeNull();
  });
});

describe("scoreHeaderRow", () => {
  it("scores an item header far above an unrelated table", () => {
    const item = scoreHeaderRow(["Sl No", "Description", "Qty", "Rate", "Amount"]);
    const bank = scoreHeaderRow(["Bank Name", "Account No", "IFSC", "Branch"]);
    expect(item.score).toBeGreaterThan(10);
    expect(bank.score).toBe(0);
  });

  it("refuses a row with a name but neither quantity nor price", () => {
    // Terms tables often have a "Description" column and nothing else of ours.
    expect(scoreHeaderRow(["Sl", "Description", "Remarks"]).score).toBe(0);
  });
});

describe("detectHeader", () => {
  it("finds a header that starts well below row 1", () => {
    expect(detectHeader(cleanGrid).row).toBe(7);
  });
});

describe("parseQuantity", () => {
  it("separates a unit written into the quantity cell", () => {
    expect(parseQuantity("5 PCS")).toEqual({ quantity: 5, unit: "PCS" });
    expect(parseQuantity("10 units")).toEqual({ quantity: 10, unit: "units" });
    expect(parseQuantity("2 Nos")).toEqual({ quantity: 2, unit: "Nos" });
  });

  it("handles bare and padded numbers", () => {
    expect(parseQuantity("2").quantity).toBe(2);
    expect(parseQuantity("02").quantity).toBe(2);
    expect(parseQuantity("2.00").quantity).toBe(2);
  });

  it("reports an unreadable quantity rather than calling it zero", () => {
    expect(parseQuantity("").quantity).toBeNull();
    expect(parseQuantity("as required").quantity).toBeNull();
  });
});

describe("isSummaryRow", () => {
  const mapping = { itemName: 1, quantity: 2, unitPrice: 3, amount: 4 };

  it("treats an unpriced total row as a summary", () => {
    const cells = ["", "Sub Total", "", "", "489000"];
    expect(isSummaryRow(cells, mapping, { quantity: null, unitPrice: null, amount: 489000 })).toBe(true);
  });

  it("keeps installation and freight when they are sold as line items", () => {
    // The distinction is structural, not the wording: this row has a qty and a rate.
    const cells = ["3", "Installation", "1", "25000", "25000"];
    expect(isSummaryRow(cells, mapping, { quantity: 1, unitPrice: 25000, amount: 25000 })).toBe(false);

    const freight = ["4", "Transportation", "2", "5000", "10000"];
    expect(isSummaryRow(freight, mapping, { quantity: 2, unitPrice: 5000, amount: 10000 })).toBe(false);
  });

  it("drops an unlabelled row carrying only a figure", () => {
    expect(isSummaryRow(["", "", "", "", "577020"], mapping, { quantity: null, unitPrice: null, amount: 577020 })).toBe(true);
  });
});

describe("parseQuotationGrid", () => {
  it("extracts items and quotation identity, excluding the summary block", () => {
    const result = parseQuotationGrid(cleanGrid);

    expect(result.items.map((i) => i.itemName)).toEqual([
      "Samsung 86 inch Display", "HDMI Cable", "Installation",
    ]);
    expect(result.items[0]).toMatchObject({ quantity: 2, unitPrice: 215000, amount: 430000, status: "valid" });
    expect(result.quotationNumber).toBe("QT-2026-1024");
    expect(result.gstNumber).toBe("29ABCDE1234F1Z5");
    expect(result.vendorName).toContain("ABC Technologies");
    expect(result.subtotal).toBe(489000);
    expect(result.grandTotal).toBe(577020);
  });

  it("warns on an amount that disagrees with qty × rate, without changing either", () => {
    const grid = [
      ["Description", "Qty", "Rate", "Amount"],
      ["Cement", "10", "380", "9999"],
    ];
    const item = parseQuotationGrid(grid).items[0];
    expect(item.unitPrice).toBe(380);
    expect(item.amount).toBe(9999); // the vendor's figure is preserved
    expect(item.status).toBe("warning");
    expect(item.warnings.join(" ")).toMatch(/does not match/i);
  });

  it("skips repeated headers where a table continues onto page 2", () => {
    const grid = [
      ["Sl No", "Description", "Qty", "Rate", "Amount"],
      ["1", "Cement", "10", "380", "3800"],
      ["Sl No", "Description", "Qty", "Rate", "Amount"],
      ["2", "Sand", "5", "1450", "7250"],
    ];
    const result = parseQuotationGrid(grid);
    expect(result.items.map((i) => i.itemName)).toEqual(["Cement", "Sand"]);
  });

  it("ignores blank rows between items", () => {
    const grid = [
      ["Particulars", "Nos", "Unit Price"],
      ["Cement", "10", "380"],
      ["", "", ""],
      ["Sand", "5", "1450"],
    ];
    expect(parseQuotationGrid(grid).items).toHaveLength(2);
  });

  it("reads the Material Description / QTY / UOM / Basic Rate / Value layout", () => {
    const grid = [
      ["Material Description", "QTY", "UOM", "Basic Rate", "Value"],
      ["TMT Bar 12mm", "500", "kg", "62", "31000"],
    ];
    const result = parseQuotationGrid(grid);
    expect(result.items[0]).toMatchObject({ itemName: "TMT Bar 12mm", quantity: 500, unit: "kg", unitPrice: 62 });
  });

  it("flags rows missing a price rather than importing them silently", () => {
    const grid = [
      ["Description", "Qty", "Rate"],
      ["Cement", "10", ""],
    ];
    const item = parseQuotationGrid(grid).items[0];
    expect(item.unitPrice).toBeNull();
    expect(item.warnings).toContain("Missing unit price");
  });

  it("warns when the item total disagrees with the stated subtotal", () => {
    const grid = [
      ["Description", "Qty", "Rate", "Amount"],
      ["Cement", "10", "380", "3800"],
      ["Sub Total", "", "", "9999"],
    ];
    expect(parseQuotationGrid(grid).warnings.join(" ")).toMatch(/subtotal/i);
  });

  it("marks OCR output as needing a check", () => {
    expect(parseQuotationGrid(cleanGrid, { fromOcr: true }).warnings.join(" ")).toMatch(/OCR/);
  });

  it("reports a missing table instead of inventing items", () => {
    const result = parseQuotationGrid([["Bank Name", "Account No", "IFSC"], ["HDFC", "123", "HDFC0001"]]);
    expect(result.items).toHaveLength(0);
    expect(result.warnings.join(" ")).toMatch(/Could not find an item table/);
  });

  it("honours a supplied mapping over automatic detection", () => {
    const grid = [
      ["Thing", "Count", "Cost"],
      ["Cement", "10", "380"],
    ];
    // "Thing"/"Count"/"Cost" are unknown words, so detection alone finds nothing.
    expect(parseQuotationGrid(grid).items).toHaveLength(0);
  });
});

describe("wordsToGrid", () => {
  /** Two rows of a borderless PDF table, as positioned text. */
  const word = (text: string, x: number, y: number): PositionedWord => ({
    text, x, y, width: text.length * 6, height: 10,
  });

  it("rebuilds rows and columns from coordinates", () => {
    const grid = wordsToGrid([
      word("Description", 50, 100), word("Qty", 300, 100), word("Rate", 400, 100),
      word("Cement", 50, 120), word("10", 300, 120), word("380", 400, 120),
      word("Sand", 50, 140), word("5", 300, 140), word("1450", 400, 140),
    ]);
    expect(grid[0]).toEqual(["Description", "Qty", "Rate"]);
    expect(grid[1]).toEqual(["Cement", "10", "380"]);
    expect(grid[2]).toEqual(["Sand", "5", "1450"]);
  });

  it("keeps words on one line together despite small baseline drift", () => {
    const grid = wordsToGrid([
      word("Samsung", 50, 120), word("Display", 98, 122),
      word("2", 300, 121),
    ]);
    expect(grid).toHaveLength(1);
    expect(grid[0][0]).toBe("Samsung Display");
  });
});

describe("vendor mapping memory", () => {
  const vendors = [
    { id: "v1", name: "ABC Technologies", companyName: "ABC Technologies Pvt Ltd", gstNumber: "29ABCDE1234F1Z5" },
    { id: "v2", name: "XYZ Traders", companyName: null, gstNumber: "27XYZAB5678C1Z9" },
  ];

  it("identifies a vendor exactly by GST", () => {
    const result = identifyVendor({ gstNumber: "29abcde1234f1z5" }, vendors);
    expect(result.vendor?.id).toBe("v1");
    expect(result.basis).toBe("gst");
  });

  it("matches company names across legal-suffix formatting", () => {
    expect(identifyVendor({ vendorName: "ABC TECHNOLOGIES PRIVATE LIMITED" }, vendors).vendor?.id).toBe("v1");
    expect(identifyVendor({ vendorName: "ABC Technologies" }, vendors).vendor?.id).toBe("v1");
  });

  it("refuses to guess between similar vendors", () => {
    // Partial names must not match, or two vendors could share a mapping.
    expect(identifyVendor({ vendorName: "ABC" }, vendors).vendor).toBeNull();
    expect(identifyVendor({ vendorName: "ABC Technologies Solutions" }, vendors).vendor).toBeNull();
  });

  it("round-trips a saved mapping through the vendor's own header wording", () => {
    const headers = ["Sl", "Product Description", "QTY", "UOM", "Price", "Value"];
    const mapping = { itemName: 1, quantity: 2, unit: 3, unitPrice: 4, amount: 5 };

    const saved = toSavedMapping(headers, mapping);
    expect(saved).toEqual({
      "Product Description": "itemName", QTY: "quantity", UOM: "unit", Price: "unitPrice", Value: "amount",
    });
    expect(applySavedMapping(headers, saved)).toEqual(mapping);
  });

  it("survives a vendor inserting a column, because it matches on header text", () => {
    const saved = { "Product Description": "itemName" as const, Price: "unitPrice" as const };
    // "HSN" is new and pushes Price one to the right.
    expect(applySavedMapping(["Sl", "Product Description", "HSN", "Price"], saved)).toEqual({
      itemName: 1, unitPrice: 3,
    });
  });

  it("rejects malformed stored mappings", () => {
    expect(readSavedMapping(null)).toBeNull();
    expect(readSavedMapping({ Price: "notAField" })).toBeNull();
    expect(readSavedMapping(["Price"])).toBeNull();
    expect(readSavedMapping({ Price: "unitPrice" })).toEqual({ Price: "unitPrice" });
  });
});
