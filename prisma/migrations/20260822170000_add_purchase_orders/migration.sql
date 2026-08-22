-- POStatus was declared in the schema but never used by a table, so the type
-- may or may not exist yet.
DO $$ BEGIN
  CREATE TYPE "POStatus" AS ENUM ('ORDERED', 'DELIVERED', 'CANCELLED', 'CLOSED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "BuyerCompany" AS ENUM ('WT', 'PL');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE "purchase_order" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "poNumber" TEXT NOT NULL,
    "company" "BuyerCompany" NOT NULL,
    "financialYear" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "indentId" TEXT,
    "referenceNo" TEXT,
    "poDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deliveryAddress" TEXT NOT NULL,
    "intraState" BOOLEAN NOT NULL DEFAULT true,
    "subtotal" INTEGER NOT NULL,
    "cgst" INTEGER NOT NULL,
    "sgst" INTEGER NOT NULL,
    "igst" INTEGER NOT NULL,
    "roundOff" INTEGER NOT NULL DEFAULT 0,
    "grandTotal" INTEGER NOT NULL,
    "status" "POStatus" NOT NULL DEFAULT 'ORDERED',
    "terms" TEXT[],
    "notes" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "purchase_order_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "po_line_item" (
    "id" TEXT NOT NULL,
    "poId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "rate" INTEGER NOT NULL,
    "amount" INTEGER NOT NULL,
    "taxPercent" INTEGER NOT NULL DEFAULT 18,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "po_line_item_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "po_sequence" (
    "workspaceId" TEXT NOT NULL,
    "company" "BuyerCompany" NOT NULL,
    "financialYear" TEXT NOT NULL,
    "next" INTEGER NOT NULL,

    CONSTRAINT "po_sequence_pkey" PRIMARY KEY ("workspaceId","company","financialYear")
);

CREATE UNIQUE INDEX "purchase_order_workspaceId_poNumber_key" ON "purchase_order"("workspaceId", "poNumber");
CREATE INDEX "purchase_order_workspaceId_createdAt_idx" ON "purchase_order"("workspaceId", "createdAt" DESC);
CREATE INDEX "purchase_order_vendorId_idx" ON "purchase_order"("vendorId");
CREATE INDEX "purchase_order_indentId_idx" ON "purchase_order"("indentId");
CREATE INDEX "po_line_item_poId_idx" ON "po_line_item"("poId");

ALTER TABLE "purchase_order" ADD CONSTRAINT "purchase_order_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "purchase_order" ADD CONSTRAINT "purchase_order_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "vendor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "purchase_order" ADD CONSTRAINT "purchase_order_indentId_fkey" FOREIGN KEY ("indentId") REFERENCES "indent"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "purchase_order" ADD CONSTRAINT "purchase_order_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "WorkspaceMember"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "po_line_item" ADD CONSTRAINT "po_line_item_poId_fkey" FOREIGN KEY ("poId") REFERENCES "purchase_order"("id") ON DELETE CASCADE ON UPDATE CASCADE;
