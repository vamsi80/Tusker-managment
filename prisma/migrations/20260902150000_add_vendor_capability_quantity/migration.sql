-- Quantity a hand-added material's rate was agreed for; rate x quantity is the
-- row total. Nullable: capabilities auto-created from an RFQ have no quantity.
ALTER TABLE "vendor_material_capability" ADD COLUMN "quantity" INTEGER;
