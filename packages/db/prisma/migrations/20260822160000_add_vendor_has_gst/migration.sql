ALTER TABLE "vendor" ADD COLUMN "hasGst" BOOLEAN NOT NULL DEFAULT false;

UPDATE "vendor"
SET "hasGst" = true
WHERE NULLIF(TRIM("gstNumber"), '') IS NOT NULL;
