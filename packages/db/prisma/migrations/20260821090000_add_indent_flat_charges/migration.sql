-- Optional lump-sum indent charges, stored in paise like every other money
-- column. Null means the charge does not apply. Unlike tax/excise/VAT these are
-- flat amounts, not percentages of the material subtotal.
ALTER TABLE "indent"
ADD COLUMN "transportCharge" INTEGER,
ADD COLUMN "labourCharge" INTEGER;
