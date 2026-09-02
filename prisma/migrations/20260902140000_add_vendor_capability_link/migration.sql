-- Reference link for a hand-added material: a photo, a quotation, a catalogue
-- page. Nullable, and only ever opened in a new tab.
ALTER TABLE "vendor_material_capability" ADD COLUMN "link" TEXT;
