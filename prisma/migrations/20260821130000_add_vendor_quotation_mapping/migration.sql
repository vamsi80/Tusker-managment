-- Remembers how a vendor's quotation columns map onto indent line item fields,
-- so a repeat quotation in the same format imports without manual mapping.
-- Stored on the vendor rather than in its own table: exactly one mapping per
-- vendor, referenced by nothing else.
ALTER TABLE "vendor"
ADD COLUMN "quotationMapping" JSONB;
