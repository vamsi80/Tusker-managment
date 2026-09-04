-- Three business verticals every new project is filed under.
DO $$ BEGIN
  CREATE TYPE "ProjectCategory" AS ENUM ('WHITE_TUSKER', 'LATTICE_LANE', 'MISCELLANEOUS');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Nullable, no backfill: projects that predate categories stay uncategorised
-- until someone edits them, rather than being guessed into the wrong vertical.
ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "category" "ProjectCategory";
