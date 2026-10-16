-- One-off repair of Task.completedSubtaskCount.
--
-- TasksService.updateTask passed `data.status === "COMPLETED"` as the
-- "is now completed" flag, so any edit to a completed subtask that did not touch
-- its status (rename, description, tags) read as a reopen and decremented the
-- parent's counter. Measured before this fix: 9 of 204 parents under-counted,
-- none over-counted. The code is fixed alongside this migration; this resets
-- every parent to the real number of completed children.
--
-- Idempotent: only rows that disagree with the recount are written, and a
-- second run finds none. Raw SQL leaves "updatedAt" alone (Prisma maintains it,
-- not the database), so the repair does not show up as an edit on any task.
UPDATE "public"."Task" AS p
SET "completedSubtaskCount" = actual.n
FROM (
  SELECT t."id",
         (SELECT count(*)::int
            FROM "public"."Task" c
           WHERE c."parentTaskId" = t."id"
             AND c."status" = 'COMPLETED') AS n
    FROM "public"."Task" t
   WHERE t."parentTaskId" IS NULL
) AS actual
WHERE p."id" = actual."id"
  AND p."completedSubtaskCount" <> actual.n;
