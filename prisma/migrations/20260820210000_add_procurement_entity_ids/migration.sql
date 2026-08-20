-- Human-readable procurement IDs are scoped to a workspace. Internal primary
-- keys remain unchanged and continue to be used by foreign-key relationships.
ALTER TABLE "Workspace"
ADD COLUMN "nextVendorNumber" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN "nextMaterialNumber" INTEGER NOT NULL DEFAULT 1;

ALTER TABLE "vendor" ADD COLUMN "vendorId" TEXT;
ALTER TABLE "material_catalog" ADD COLUMN "materialId" TEXT;

-- Backfill stable display IDs for existing vendors and materials.
WITH numbered_vendors AS (
  SELECT
    "id",
    'VEN-' || LPAD(
      ROW_NUMBER() OVER (
        PARTITION BY "workspaceId"
        ORDER BY "createdAt", "id"
      )::TEXT,
      4,
      '0'
    ) AS "generatedId"
  FROM "vendor"
)
UPDATE "vendor" AS vendor
SET "vendorId" = numbered_vendors."generatedId"
FROM numbered_vendors
WHERE vendor."id" = numbered_vendors."id";

WITH numbered_materials AS (
  SELECT
    "id",
    'MAT-' || LPAD(
      ROW_NUMBER() OVER (
        PARTITION BY "workspaceId"
        ORDER BY "createdAt", "id"
      )::TEXT,
      4,
      '0'
    ) AS "generatedId"
  FROM "material_catalog"
)
UPDATE "material_catalog" AS material
SET "materialId" = numbered_materials."generatedId"
FROM numbered_materials
WHERE material."id" = numbered_materials."id";

-- Continue each workspace sequence after its backfilled records.
UPDATE "Workspace" AS workspace
SET "nextVendorNumber" = COALESCE(
  (SELECT COUNT(*) + 1 FROM "vendor" WHERE "workspaceId" = workspace."id"),
  1
);

UPDATE "Workspace" AS workspace
SET "nextMaterialNumber" = COALESCE(
  (SELECT COUNT(*) + 1 FROM "material_catalog" WHERE "workspaceId" = workspace."id"),
  1
);

ALTER TABLE "vendor" ALTER COLUMN "vendorId" SET NOT NULL;
ALTER TABLE "material_catalog" ALTER COLUMN "materialId" SET NOT NULL;

CREATE UNIQUE INDEX "vendor_workspaceId_vendorId_key"
ON "vendor"("workspaceId", "vendorId");

CREATE UNIQUE INDEX "material_catalog_workspaceId_materialId_key"
ON "material_catalog"("workspaceId", "materialId");

-- Link transactional material records to their catalog entries. Material names
-- and units remain on the records as immutable procurement snapshots.
ALTER TABLE "indent_line_item" ADD COLUMN "materialCatalogId" TEXT;
ALTER TABLE "vendor_material_capability" ADD COLUMN "materialCatalogId" TEXT;

UPDATE "indent_line_item" AS line_item
SET "materialCatalogId" = material."id"
FROM "indent", "material_catalog" AS material
WHERE line_item."indentId" = "indent"."id"
  AND material."workspaceId" = "indent"."workspaceId"
  AND LOWER(TRIM(material."name")) = LOWER(TRIM(line_item."materialName"));

UPDATE "vendor_material_capability" AS capability
SET "materialCatalogId" = material."id"
FROM "material_catalog" AS material
WHERE material."workspaceId" = capability."workspaceId"
  AND LOWER(TRIM(material."name")) = LOWER(TRIM(capability."materialName"));

CREATE INDEX "indent_line_item_materialCatalogId_idx"
ON "indent_line_item"("materialCatalogId");

CREATE INDEX "vendor_material_capability_materialCatalogId_idx"
ON "vendor_material_capability"("materialCatalogId");

ALTER TABLE "indent_line_item"
ADD CONSTRAINT "indent_line_item_materialCatalogId_fkey"
FOREIGN KEY ("materialCatalogId") REFERENCES "material_catalog"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "vendor_material_capability"
ADD CONSTRAINT "vendor_material_capability_materialCatalogId_fkey"
FOREIGN KEY ("materialCatalogId") REFERENCES "material_catalog"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
