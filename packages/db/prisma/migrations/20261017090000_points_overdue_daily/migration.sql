-- Late tasks now cost one point per working day while they stay open, charged
-- by the daily accrueOverduePoints cron job. Days a task sits in REVIEW are not
-- charged: that wait is on the reviewer, not the assignee. Completing a task no
-- longer scores lateness, only finishing early.
--
-- One charge per task per day: the job stamps occurredAt with that day's IST
-- midnight and inserts with ON CONFLICT DO NOTHING, so a re-run adds nothing.
-- Partial index, so not in schema.prisma — never `prisma db push` this table.
-- Schema-qualified for search_path = boq, public (see 20261016110000_reward_points).
CREATE UNIQUE INDEX IF NOT EXISTS "PointsEntry_task_overdue_day_key"
  ON "public"."PointsEntry"("taskId", "occurredAt")
  WHERE "kind" = 'TASK_OVERDUE';
