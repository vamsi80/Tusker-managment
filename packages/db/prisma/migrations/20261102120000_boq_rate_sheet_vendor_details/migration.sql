-- BOQ, rate-sheet trades, and vendor bank / verification details.
--
-- Additive only: existing vendors start PENDING with no bank details, existing
-- rates have no trade, and indents / POs are untouched.
--
-- Everything is schema-qualified. This database connects with
-- search_path = boq, public, so an unqualified CREATE lands in boq while Prisma
-- reads and writes public (see 20260908170000_remove_misplaced_message_deletion_table).
-- That includes the enum type on boq_line_item.serviceType. No CREATE TYPE:
-- statuses are TEXT for the same reason. Idempotent throughout.

-- Vendor: bank details + verification ---------------------------------------
ALTER TABLE "public"."vendor"
  ADD COLUMN IF NOT EXISTS "bankAccountName" TEXT,
  ADD COLUMN IF NOT EXISTS "bankAccountNumber" TEXT,
  ADD COLUMN IF NOT EXISTS "bankBranch" TEXT,
  ADD COLUMN IF NOT EXISTS "bankIfsc" TEXT,
  ADD COLUMN IF NOT EXISTS "bankName" TEXT,
  ADD COLUMN IF NOT EXISTS "verificationStatus" TEXT NOT NULL DEFAULT 'PENDING',
  ADD COLUMN IF NOT EXISTS "verifiedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "verifiedById" TEXT;

-- Trades (BOQ departments) ----------------------------------------------------
CREATE TABLE IF NOT EXISTS "public"."trade" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "trade_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "trade_workspaceId_name_key" ON "public"."trade"("workspaceId", "name");

ALTER TABLE "public"."vendor_material_capability" ADD COLUMN IF NOT EXISTS "tradeId" TEXT;
CREATE INDEX IF NOT EXISTS "vendor_material_capability_tradeId_idx" ON "public"."vendor_material_capability"("tradeId");

-- BOQ -------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "public"."boq" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "revision" INTEGER NOT NULL DEFAULT 0,
  "status" TEXT NOT NULL DEFAULT 'DRAFT',
  "revisedFromId" TEXT,
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "boq_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "boq_workspaceId_updatedAt_idx" ON "public"."boq"("workspaceId", "updatedAt" DESC);
CREATE UNIQUE INDEX IF NOT EXISTS "boq_projectId_name_revision_key" ON "public"."boq"("projectId", "name", "revision");

CREATE TABLE IF NOT EXISTS "public"."boq_zone" (
  "id" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "boq_zone_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "boq_zone_projectId_name_key" ON "public"."boq_zone"("projectId", "name");

CREATE TABLE IF NOT EXISTS "public"."boq_line_item" (
  "id" TEXT NOT NULL,
  "boqId" TEXT NOT NULL,
  "tradeId" TEXT NOT NULL,
  "zoneId" TEXT,
  "vendorId" TEXT,
  "capabilityId" TEXT,
  "description" TEXT NOT NULL,
  "unit" TEXT NOT NULL,
  "serviceType" "public"."CapabilityServiceType" NOT NULL DEFAULT 'LABOUR',
  "rate" INTEGER NOT NULL,
  "inputUnit" TEXT NOT NULL DEFAULT 'mm',
  "length" DECIMAL(12,3),
  "breadth" DECIMAL(12,3),
  "depth" DECIMAL(12,3),
  "quantity" DECIMAL(12,3) NOT NULL DEFAULT 1,
  "measuredQty" DECIMAL(14,4) NOT NULL,
  "markupPercent" DECIMAL(5,2) NOT NULL DEFAULT 0,
  "costAmount" INTEGER NOT NULL,
  "amount" INTEGER NOT NULL,
  "notes" TEXT,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "boq_line_item_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "boq_line_item_boqId_sortOrder_idx" ON "public"."boq_line_item"("boqId", "sortOrder");
CREATE INDEX IF NOT EXISTS "boq_line_item_tradeId_idx" ON "public"."boq_line_item"("tradeId");
CREATE INDEX IF NOT EXISTS "boq_line_item_zoneId_idx" ON "public"."boq_line_item"("zoneId");

ALTER TABLE "public"."trade" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."boq" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."boq_zone" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."boq_line_item" ENABLE ROW LEVEL SECURITY;

-- Foreign keys, each added only if missing -----------------------------------
DO $$
DECLARE
  fk RECORD;
BEGIN
  FOR fk IN SELECT * FROM (VALUES
    ('vendor', 'vendor_verifiedById_fkey',
      'FOREIGN KEY ("verifiedById") REFERENCES "public"."WorkspaceMember"("id") ON DELETE SET NULL ON UPDATE CASCADE'),
    ('vendor_material_capability', 'vendor_material_capability_tradeId_fkey',
      'FOREIGN KEY ("tradeId") REFERENCES "public"."trade"("id") ON DELETE SET NULL ON UPDATE CASCADE'),
    ('trade', 'trade_workspaceId_fkey',
      'FOREIGN KEY ("workspaceId") REFERENCES "public"."Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE'),
    ('boq', 'boq_workspaceId_fkey',
      'FOREIGN KEY ("workspaceId") REFERENCES "public"."Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE'),
    ('boq', 'boq_projectId_fkey',
      'FOREIGN KEY ("projectId") REFERENCES "public"."Project"("id") ON DELETE CASCADE ON UPDATE CASCADE'),
    ('boq', 'boq_revisedFromId_fkey',
      'FOREIGN KEY ("revisedFromId") REFERENCES "public"."boq"("id") ON DELETE SET NULL ON UPDATE CASCADE'),
    ('boq', 'boq_createdById_fkey',
      'FOREIGN KEY ("createdById") REFERENCES "public"."WorkspaceMember"("id") ON DELETE RESTRICT ON UPDATE CASCADE'),
    ('boq_zone', 'boq_zone_projectId_fkey',
      'FOREIGN KEY ("projectId") REFERENCES "public"."Project"("id") ON DELETE CASCADE ON UPDATE CASCADE'),
    ('boq_line_item', 'boq_line_item_boqId_fkey',
      'FOREIGN KEY ("boqId") REFERENCES "public"."boq"("id") ON DELETE CASCADE ON UPDATE CASCADE'),
    ('boq_line_item', 'boq_line_item_tradeId_fkey',
      'FOREIGN KEY ("tradeId") REFERENCES "public"."trade"("id") ON DELETE RESTRICT ON UPDATE CASCADE'),
    ('boq_line_item', 'boq_line_item_zoneId_fkey',
      'FOREIGN KEY ("zoneId") REFERENCES "public"."boq_zone"("id") ON DELETE SET NULL ON UPDATE CASCADE'),
    ('boq_line_item', 'boq_line_item_vendorId_fkey',
      'FOREIGN KEY ("vendorId") REFERENCES "public"."vendor"("id") ON DELETE SET NULL ON UPDATE CASCADE'),
    ('boq_line_item', 'boq_line_item_capabilityId_fkey',
      'FOREIGN KEY ("capabilityId") REFERENCES "public"."vendor_material_capability"("id") ON DELETE SET NULL ON UPDATE CASCADE')
  ) AS t(tbl, name, def)
  LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_constraint
                   WHERE conname = fk.name
                     AND conrelid = format('"public".%I', fk.tbl)::regclass) THEN
      EXECUTE format('ALTER TABLE "public".%I ADD CONSTRAINT %I %s', fk.tbl, fk.name, fk.def);
    END IF;
  END LOOP;
END $$;
