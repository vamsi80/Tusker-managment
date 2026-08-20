ALTER TABLE "indent" ADD COLUMN "selectedVendorId" TEXT;
ALTER TABLE "indent" ADD CONSTRAINT "indent_selectedVendorId_fkey" FOREIGN KEY ("selectedVendorId") REFERENCES "vendor"("id") ON DELETE SET NULL ON UPDATE CASCADE;
