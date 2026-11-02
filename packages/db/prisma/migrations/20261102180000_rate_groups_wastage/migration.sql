-- Rate-sheet categories / subcategories, and wastage on rates and BOQ lines.
--
-- Additive only: existing rates have no group and 0% wastage, existing BOQ
-- lines keep their totals (0% wastage changes nothing).
--
-- Schema-qualified throughout: this database connects with
-- search_path = boq, public, and Prisma reads and writes public.
-- Idempotent throughout.

CREATE TABLE IF NOT EXISTS "public"."rate_group" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "tradeId" TEXT,
  "parentId" TEXT,
  "name" TEXT NOT NULL,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "rate_group_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "rate_group_workspaceId_tradeId_idx" ON "public"."rate_group"("workspaceId", "tradeId");
CREATE INDEX IF NOT EXISTS "rate_group_parentId_idx" ON "public"."rate_group"("parentId");
ALTER TABLE "public"."rate_group" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."vendor_material_capability"
  ADD COLUMN IF NOT EXISTS "groupId" TEXT,
  ADD COLUMN IF NOT EXISTS "wastagePercent" DECIMAL(5,2) NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS "vendor_material_capability_groupId_idx" ON "public"."vendor_material_capability"("groupId");

ALTER TABLE "public"."boq_line_item"
  ADD COLUMN IF NOT EXISTS "wastagePercent" DECIMAL(5,2) NOT NULL DEFAULT 0;

DO $$
DECLARE
  fk RECORD;
BEGIN
  FOR fk IN SELECT * FROM (VALUES
    ('rate_group', 'rate_group_workspaceId_fkey',
      'FOREIGN KEY ("workspaceId") REFERENCES "public"."Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE'),
    ('rate_group', 'rate_group_tradeId_fkey',
      'FOREIGN KEY ("tradeId") REFERENCES "public"."trade"("id") ON DELETE CASCADE ON UPDATE CASCADE'),
    ('rate_group', 'rate_group_parentId_fkey',
      'FOREIGN KEY ("parentId") REFERENCES "public"."rate_group"("id") ON DELETE CASCADE ON UPDATE CASCADE'),
    ('vendor_material_capability', 'vendor_material_capability_groupId_fkey',
      'FOREIGN KEY ("groupId") REFERENCES "public"."rate_group"("id") ON DELETE SET NULL ON UPDATE CASCADE')
  ) AS t(tbl, name, def)
  LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_constraint
                   WHERE conname = fk.name
                     AND conrelid = format('"public".%I', fk.tbl)::regclass) THEN
      EXECUTE format('ALTER TABLE "public".%I ADD CONSTRAINT %I %s', fk.tbl, fk.name, fk.def);
    END IF;
  END LOOP;
END $$;
