import { describe, it, expect } from "vitest";
import {
  cleanItems,
  matchByMaterialName,
  matchUnit,
  matchVendor,
  toNumber,
  type ScannedItem,
} from "@/lib/procurement/quote-match";
import { parseCsv, isUsableOcr } from "@/lib/procurement/quotation/sources";

const item = (over: Partial<ScannedItem>): ScannedItem => ({
  materialName: "Cement OPC 53",
  unit: "bag",
  quantity: 10,
  unitPrice: 380,
  ...over,
});

describe("cleanItems", () => {
  it("drops the total and tax rows every quotation ends with", () => {
    const rows = [
      item({}),
      item({ materialName: "Sub Total", quantity: null, unitPrice: 3800 }),
      item({ materialName: "CGST 9%", quantity: null, unitPrice: 342 }),
      item({ materialName: "Grand Total", quantity: null, unitPrice: 4484 }),
      item({ materialName: "Round Off", quantity: null, unitPrice: 1 }),
    ];
    expect(cleanItems(rows).map((r) => r.materialName)).toEqual(["Cement OPC 53"]);
  });

  it("drops rows carrying neither a rate nor a quantity", () => {
    expect(cleanItems([item({ quantity: null, unitPrice: null })])).toHaveLength(0);
    expect(cleanItems([item({ quantity: null })])).toHaveLength(1);
  });
});

describe("matchVendor", () => {
  const vendors = [
    { id: "v1", name: "Sharma Traders", companyName: "Sharma Traders Pvt Ltd" },
    { id: "v2", name: "Bharat Steel", companyName: null },
  ];

  it("matches across legal suffixes and punctuation", () => {
    expect(matchVendor("SHARMA TRADERS PRIVATE LIMITED", vendors)).toBe("v1");
    expect(matchVendor("Bharat  Steel.", vendors)).toBe("v2");
  });

  it("returns null rather than guessing", () => {
    expect(matchVendor("Kumar Cement Agency", vendors)).toBeNull();
    expect(matchVendor(null, vendors)).toBeNull();
    // Too short to be a confident signal.
    expect(matchVendor("abc", vendors)).toBeNull();
  });
});

describe("matchUnit", () => {
  const units = [
    { abbreviation: "bag", name: "Bag" },
    { abbreviation: "mtr", name: "Metre" },
  ];

  it("normalises to the abbreviation the dropdowns use", () => {
    expect(matchUnit("MTR", units)).toBe("mtr");
    expect(matchUnit("Metre", units)).toBe("mtr");
    expect(matchUnit("Bags", units)).toBe("Bags"); // unknown, preserved for the user to fix
    expect(matchUnit(null, units)).toBeNull();
  });
});

describe("matchByMaterialName", () => {
  const lineItems = [
    { id: "a", materialName: "Cement OPC 53" },
    { id: "b", materialName: "TMT Bar 12mm" },
    { id: "c", materialName: "River Sand" },
  ];

  it("prefers exact names over containment", () => {
    const scanned = [
      { materialName: "Cement OPC 53 Grade", unitPrice: 999 },
      { materialName: "Cement OPC 53", unitPrice: 380 },
    ];
    const matched = matchByMaterialName(scanned, lineItems);
    expect(matched.get("a")?.unitPrice).toBe(380);
  });

  it("leaves unmatched line items out instead of guessing", () => {
    const matched = matchByMaterialName([{ materialName: "TMT Bar 12mm", unitPrice: 62 }], lineItems);
    expect(matched.get("b")?.unitPrice).toBe(62);
    expect(matched.has("a")).toBe(false);
    expect(matched.has("c")).toBe(false);
  });

  it("never assigns one scanned row to two line items", () => {
    const matched = matchByMaterialName(
      [{ materialName: "Bar", unitPrice: 62 }],
      [
        { id: "b", materialName: "TMT Bar 12mm" },
        { id: "d", materialName: "TMT Bar 16mm" },
      ]
    );
    expect(matched.size).toBe(1);
  });
});

describe("toNumber", () => {
  it("reads Rs and Rs. alike, dot or no dot", () => {
    // The dot after "Rs" must be consumed with the prefix; left behind it reads
    // as a decimal point and turns 1250 into 0.125.
    for (const written of ["Rs.1250", "Rs 1250", "Rs1250", "RS. 1250", "rs.1250", "Rs. 1250/-", "Rs .1250"]) {
      expect(toNumber(written), written).toBe(1250);
    }
    expect(toNumber("Rs. 45.50")).toBe(45.5);
  });

  it("survives the currency and separators Indian quotations use", () => {
    expect(toNumber("₹ 1,250.50")).toBe(1250.5);
    expect(toNumber("INR 1250")).toBe(1250);
    expect(toNumber("1,25,000")).toBe(125000);
    expect(toNumber("1250/-")).toBe(1250);
    expect(toNumber("")).toBeNull();
    expect(toNumber("-")).toBeNull();
    expect(toNumber("N/A")).toBeNull();
  });
});

describe("parseCsv", () => {
  it("keeps commas and quotes inside quoted fields", () => {
    expect(parseCsv('Material,Rate\n"Cement, OPC 53",380\n"He said ""hi""",5')).toEqual([
      ["Material", "Rate"],
      ["Cement, OPC 53", "380"],
      ['He said "hi"', "5"],
    ]);
  });
});


describe("isUsableOcr", () => {
  const good = "Cement OPC 53 bag 50 380 River Sand cum 20 1450 TMT Bar 12mm kg 500 62";

  it("accepts confident output that actually contains rates", () => {
    expect(isUsableOcr(good, 82)).toBe(true);
  });

  it("rejects output that should fall through to the vision model", () => {
    expect(isUsableOcr(good, 41)).toBe(false); // handwriting confidence
    expect(isUsableOcr("Cement", 95)).toBe(false); // too little text
    // Confident prose with no digits is not a rate sheet, however clean it reads.
    expect(isUsableOcr("Quotation for supply of construction materials to site", 95)).toBe(false);
  });
});

