-- The CREATE TYPE in 20260904120000_add_project_category was unqualified, and
-- this database connects with search_path "boq, public, extensions", so the enum
-- was created in boq while "Project" lives in public. Reads resolved fine, but
-- Prisma casts writes to "public"."ProjectCategory", so every project update
-- failed with 42704 type does not exist.
--
-- Moving the type keeps the column valid: it references the type by OID, not by
-- name. Same trap as 20260902140000_departments_to_public_schema.
DO $$ BEGIN
  ALTER TYPE boq."ProjectCategory" SET SCHEMA public;
EXCEPTION WHEN undefined_object THEN NULL; END $$;
