import { PrismaClient } from "../src/generated/prisma";

const prisma = new PrismaClient();

const STANDARD_UNITS = [
  { abbreviation: "pcs", name: "Pieces", category: "quantity" },
  { abbreviation: "nos", name: "Numbers", category: "quantity" },
  { abbreviation: "kg", name: "Kilogram", category: "weight" },
  { abbreviation: "ton", name: "Tonne", category: "weight" },
  { abbreviation: "gm", name: "Gram", category: "weight" },
  { abbreviation: "ltr", name: "Litre", category: "volume" },
  { abbreviation: "ml", name: "Millilitre", category: "volume" },
  { abbreviation: "mtr", name: "Metre", category: "length" },
  { abbreviation: "ft", name: "Feet", category: "length" },
  { abbreviation: "cm", name: "Centimetre", category: "length" },
  { abbreviation: "sqft", name: "Square Feet", category: "area" },
  { abbreviation: "sqmtr", name: "Square Metre", category: "area" },
  { abbreviation: "bag", name: "Bag", category: "packaging" },
  { abbreviation: "box", name: "Box", category: "packaging" },
  { abbreviation: "roll", name: "Roll", category: "packaging" },
];

async function main() {
  console.log("🚀 Starting database migration and seeding for Units Of Measure...");

  // 1. Fetch all workspaces
  const workspaces = await prisma.workspace.findMany({
    select: { id: true, name: true },
  });

  console.log(`Found ${workspaces.length} workspace(s).`);

  for (const workspace of workspaces) {
    console.log(`\nProcessing workspace: "${workspace.name}" (ID: ${workspace.id})`);

    // 2. Seed standard units for this workspace
    for (const unit of STANDARD_UNITS) {
      await prisma.unitOfMeasure.upsert({
        where: {
          workspaceId_abbreviation: {
            workspaceId: workspace.id,
            abbreviation: unit.abbreviation,
          },
        },
        update: {
          name: unit.name,
          category: unit.category,
          isDefault: true,
        },
        create: {
          workspaceId: workspace.id,
          abbreviation: unit.abbreviation,
          name: unit.name,
          category: unit.category,
          isDefault: true,
        },
      });
    }
    console.log(`  Seeded standard units.`);

    // 3. Find all materials in this workspace
    const materials = await prisma.materialCatalog.findMany({
      where: { workspaceId: workspace.id },
    });

    console.log(`  Found ${materials.length} material(s) in catalog.`);

    // 4. Link each material's current string-based unit to a UnitOfMeasure record
    for (const material of materials) {
      if (!material.unit) continue;

      const normUnit = material.unit.toLowerCase().trim();
      if (!normUnit) continue;

      // Find or create UnitOfMeasure
      let unitRecord = await prisma.unitOfMeasure.findUnique({
        where: {
          workspaceId_abbreviation: {
            workspaceId: workspace.id,
            abbreviation: normUnit,
          },
        },
      });

      if (!unitRecord) {
        // Create custom unit of measure
        unitRecord = await prisma.unitOfMeasure.create({
          data: {
            workspaceId: workspace.id,
            abbreviation: normUnit,
            name: material.unit.trim(), // use original unit string as name
            category: "custom",
            isDefault: false,
          },
        });
        console.log(`  Created custom unit: "${normUnit}" for material "${material.name}"`);
      }

      // Link defaultUnitId in MaterialCatalog
      await prisma.materialCatalog.update({
        where: { id: material.id },
        data: { defaultUnitId: unitRecord.id },
      });
    }
    console.log(`  Completed linking units for all materials.`);
  }

  console.log("\n🎉 Seeding and units data migration completed successfully!");
}

main()
  .catch((e) => {
    console.error("❌ Error running migration:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
