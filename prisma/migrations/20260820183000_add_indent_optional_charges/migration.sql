-- Optional indent-level charges, stored as percentages and applied to the
-- material subtotal. Null means the charge does not apply.
ALTER TABLE "indent"
ADD COLUMN "taxPercent" DECIMAL(5,2),
ADD COLUMN "exciseDutyPercent" DECIMAL(5,2),
ADD COLUMN "vatPercent" DECIMAL(5,2);
