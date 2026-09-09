-- Project Settings: per-member permission deltas and project-wide defaults.
-- Both nullable and additive; NULL means "use the built-in defaults", so every
-- existing project keeps behaving exactly as it did before this migration.
-- No CREATE TYPE here on purpose: this database connects with
-- search_path = boq, public, and an unqualified CREATE TYPE fails with 42704.
ALTER TABLE "ProjectMember" ADD COLUMN IF NOT EXISTS "permissionOverrides" JSONB;
ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "settings" JSONB;
