-- Rate agreed with the vendor for a material, in paise. Nullable: capabilities
-- auto-created from an RFQ have no agreed rate yet.
ALTER TABLE "vendor_material_capability" ADD COLUMN "rate" INTEGER;
