-- Departments + shared shift schedules.
--
-- Purely additive: two new tables, one new nullable column on "WorkspaceMember",
-- and one INSERT that only writes the new table. No existing row is modified or
-- deleted, so every member keeps behaving exactly as before this migration
-- (departmentId is NULL, and the resolver falls back to the Workspace columns).

CREATE TABLE IF NOT EXISTS "ShiftSchedule" (
    "id"                TEXT NOT NULL,
    "workspaceId"       TEXT NOT NULL,
    "name"              TEXT NOT NULL,
    "lateThreshold"     TEXT NOT NULL,
    "halfDayThreshold"  TEXT NOT NULL,
    "shiftStartTime"    TEXT NOT NULL,
    "shiftEndTime"      TEXT NOT NULL,
    "overtimeThreshold" TEXT NOT NULL,
    "createdAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"         TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ShiftSchedule_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "Department" (
    "id"              TEXT NOT NULL,
    "workspaceId"     TEXT NOT NULL,
    "name"            TEXT NOT NULL,
    "shiftScheduleId" TEXT,
    "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"       TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Department_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ShiftSchedule_workspaceId_name_key" ON "ShiftSchedule"("workspaceId", "name");
CREATE INDEX IF NOT EXISTS "ShiftSchedule_workspaceId_idx" ON "ShiftSchedule"("workspaceId");
CREATE UNIQUE INDEX IF NOT EXISTS "Department_workspaceId_name_key" ON "Department"("workspaceId", "name");
CREATE INDEX IF NOT EXISTS "Department_workspaceId_idx" ON "Department"("workspaceId");

ALTER TABLE "ShiftSchedule" DROP CONSTRAINT IF EXISTS "ShiftSchedule_workspaceId_fkey";
ALTER TABLE "ShiftSchedule" ADD CONSTRAINT "ShiftSchedule_workspaceId_fkey"
    FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Department" DROP CONSTRAINT IF EXISTS "Department_workspaceId_fkey";
ALTER TABLE "Department" ADD CONSTRAINT "Department_workspaceId_fkey"
    FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- SET NULL, not CASCADE: deleting a shift schedule must never delete departments.
ALTER TABLE "Department" DROP CONSTRAINT IF EXISTS "Department_shiftScheduleId_fkey";
ALTER TABLE "Department" ADD CONSTRAINT "Department_shiftScheduleId_fkey"
    FOREIGN KEY ("shiftScheduleId") REFERENCES "ShiftSchedule"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- SET NULL, not CASCADE: deleting a department must never delete people.
ALTER TABLE "WorkspaceMember" ADD COLUMN IF NOT EXISTS "departmentId" TEXT;
CREATE INDEX IF NOT EXISTS "WorkspaceMember_workspaceId_departmentId_idx" ON "WorkspaceMember"("workspaceId", "departmentId");
ALTER TABLE "WorkspaceMember" DROP CONSTRAINT IF EXISTS "WorkspaceMember_departmentId_fkey";
ALTER TABLE "WorkspaceMember" ADD CONSTRAINT "WorkspaceMember_departmentId_fkey"
    FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Seed the two schedules every workspace starts with, both copied from that
-- workspace's current thresholds so nothing changes until an admin edits them.
-- ON CONFLICT DO NOTHING keeps this safe to re-run.
INSERT INTO "ShiftSchedule" ("id", "workspaceId", "name", "lateThreshold", "halfDayThreshold",
                             "shiftStartTime", "shiftEndTime", "overtimeThreshold", "updatedAt")
SELECT gen_random_uuid(), w."id", n."name",
       COALESCE(w."lateThreshold", '21:30'),
       COALESCE(w."halfDayThreshold", '23:00'),
       COALESCE(w."shiftStartTime", '21:30'),
       COALESCE(w."shiftEndTime", '07:00'),
       COALESCE(w."overtimeThreshold", '07:00'),
       NOW()
FROM "Workspace" w
CROSS JOIN (VALUES ('Head Office'), ('Factory')) AS n("name")
ON CONFLICT ("workspaceId", "name") DO NOTHING;
