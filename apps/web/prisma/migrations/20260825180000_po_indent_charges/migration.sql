-- Carry the indent's approved extras onto the purchase order so they print
-- under the subtotal. All additive: percentages are nullable, the flat charges
-- default to 0, so existing purchase orders total exactly as they did before.
ALTER TABLE "purchase_order" ADD COLUMN "exciseDutyPercent" DECIMAL(5,2);
ALTER TABLE "purchase_order" ADD COLUMN "vatPercent" DECIMAL(5,2);
ALTER TABLE "purchase_order" ADD COLUMN "transportCharge" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "purchase_order" ADD COLUMN "labourCharge" INTEGER NOT NULL DEFAULT 0;
