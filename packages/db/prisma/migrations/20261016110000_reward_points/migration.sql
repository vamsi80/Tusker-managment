-- Reward points: an append-only ledger (spec: 5.md at the repo root).
--
-- Completing a task early earns its assignee one point per working day early,
-- late costs one per working day late, on time scores nothing. Owners, admins
-- and managers can also award or deduct points by hand, with a reason.
--
-- Everything here is schema-qualified. This database connects with
-- search_path = boq, public, so an unqualified CREATE lands in boq while Prisma
-- reads and writes public (see 20260908170000_remove_misplaced_message_deletion_table).
-- No CREATE TYPE: "kind" is TEXT for the same reason. Idempotent throughout.

-- When the task last entered COMPLETED. No backfill on purpose: updatedAt is
-- not a truthful completion date, so history is never scored and everyone
-- starts from zero.
ALTER TABLE "public"."Task" ADD COLUMN IF NOT EXISTS "completedAt" TIMESTAMP(3);

-- WEEKLY | MONTHLY | QUARTERLY | YEARLY | NEVER: where the balance restarts.
ALTER TABLE "public"."Workspace"
  ADD COLUMN IF NOT EXISTS "pointsResetPeriod" TEXT NOT NULL DEFAULT 'MONTHLY';

CREATE TABLE IF NOT EXISTS "public"."PointsEntry" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "workspaceMemberId" TEXT NOT NULL,
  "points" INTEGER NOT NULL,
  "kind" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "taskId" TEXT,
  "reversedAt" TIMESTAMP(3),
  "reversesEntryId" TEXT,
  "awardedById" TEXT,
  "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PointsEntry_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "public"."PointsEntry" ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS "PointsEntry_workspaceId_occurredAt_idx"
  ON "public"."PointsEntry"("workspaceId", "occurredAt" DESC);
CREATE INDEX IF NOT EXISTS "PointsEntry_workspaceMemberId_occurredAt_idx"
  ON "public"."PointsEntry"("workspaceMemberId", "occurredAt" DESC);
CREATE INDEX IF NOT EXISTS "PointsEntry_taskId_idx"
  ON "public"."PointsEntry"("taskId");

-- At most one live completion award per task. Not in schema.prisma, because
-- Prisma cannot express a partial index — never `prisma db push` this table.
CREATE UNIQUE INDEX IF NOT EXISTS "PointsEntry_open_task_award_key"
  ON "public"."PointsEntry"("taskId")
  WHERE "kind" = 'TASK_COMPLETION' AND "reversedAt" IS NULL;

-- Foreign keys. Task and awarder are SET NULL so tidying a task away or a
-- member leaving never deletes points already earned; RESTRICT would turn
-- those deletes into raw FK errors. Recipient and workspace cascade.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'PointsEntry_workspaceId_fkey'
                   AND conrelid = '"public"."PointsEntry"'::regclass) THEN
    ALTER TABLE "public"."PointsEntry" ADD CONSTRAINT "PointsEntry_workspaceId_fkey"
      FOREIGN KEY ("workspaceId") REFERENCES "public"."Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'PointsEntry_workspaceMemberId_fkey'
                   AND conrelid = '"public"."PointsEntry"'::regclass) THEN
    ALTER TABLE "public"."PointsEntry" ADD CONSTRAINT "PointsEntry_workspaceMemberId_fkey"
      FOREIGN KEY ("workspaceMemberId") REFERENCES "public"."WorkspaceMember"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'PointsEntry_awardedById_fkey'
                   AND conrelid = '"public"."PointsEntry"'::regclass) THEN
    ALTER TABLE "public"."PointsEntry" ADD CONSTRAINT "PointsEntry_awardedById_fkey"
      FOREIGN KEY ("awardedById") REFERENCES "public"."WorkspaceMember"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'PointsEntry_taskId_fkey'
                   AND conrelid = '"public"."PointsEntry"'::regclass) THEN
    ALTER TABLE "public"."PointsEntry" ADD CONSTRAINT "PointsEntry_taskId_fkey"
      FOREIGN KEY ("taskId") REFERENCES "public"."Task"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
