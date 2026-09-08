-- Corrective follow-up to 20260902120000_add_departments.
--
-- That migration created "ShiftSchedule" and "Department" unqualified. This
-- database's role has search_path = "boq, public, extensions", so both tables
-- were created in "boq" instead of "public" and the Prisma client (which reads
-- public) could not see them. The "departmentId" column landed correctly,
-- because only public has a "WorkspaceMember" table to resolve against.
--
-- SET SCHEMA moves each table with its rows, indexes, constraints and inbound
-- foreign keys intact, so the seeded Head Office / Factory rows are preserved.
-- Guarded so it is a no-op on a database where they are already in public.

DO $$
BEGIN
    IF to_regclass('boq."ShiftSchedule"') IS NOT NULL THEN
        ALTER TABLE boq."ShiftSchedule" SET SCHEMA public;
    END IF;

    IF to_regclass('boq."Department"') IS NOT NULL THEN
        ALTER TABLE boq."Department" SET SCHEMA public;
    END IF;
END
$$;
