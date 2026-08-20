/**
 * Units of measure as they are stored: symbols keep their own casing (kg, not KG)
 * and every screen picks from this same list, so "mtr" never has to match "meter".
 * Mirrors the seeded catalog in prisma/seed-units.ts; used when a workspace has none yet.
 */
export const FALLBACK_UNITS = [
  { abbreviation: "pcs", name: "Pieces" },
  { abbreviation: "nos", name: "Numbers" },
  { abbreviation: "kg", name: "Kilogram" },
  { abbreviation: "ton", name: "Tonne" },
  { abbreviation: "gm", name: "Gram" },
  { abbreviation: "ltr", name: "Litre" },
  { abbreviation: "ml", name: "Millilitre" },
  { abbreviation: "mtr", name: "Metre" },
  { abbreviation: "ft", name: "Feet" },
  { abbreviation: "cm", name: "Centimetre" },
  { abbreviation: "sqft", name: "Square Feet" },
  { abbreviation: "sqmtr", name: "Square Metre" },
  { abbreviation: "bag", name: "Bag" },
  { abbreviation: "box", name: "Box" },
  { abbreviation: "roll", name: "Roll" },
];
