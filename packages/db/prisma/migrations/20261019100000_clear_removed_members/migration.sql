-- One-off cleanup for members removed before deactivateMember cleared them
-- itself.
--
-- Removal handed over pending work but left the member on every cancelled or
-- status-less task, and as manager of any project they ran. Their names kept
-- showing up in those projects. Completed tasks are left alone on purpose:
-- they record who did the work.
--
-- Idempotent: a second run matches no rows. Raw SQL leaves "updatedAt" alone,
-- so the cleanup does not show up as an edit on any task.
UPDATE "public"."Task" AS t
SET "assigneeId" = NULL
FROM "public"."ProjectMember" pm
JOIN "public"."WorkspaceMember" wm ON wm."id" = pm."workspaceMemberId"
WHERE t."assigneeId" = pm."id"
  AND wm."deactivatedAt" IS NOT NULL
  AND t."status" IS DISTINCT FROM 'COMPLETED';

UPDATE "public"."Task" AS t
SET "reviewerId" = NULL
FROM "public"."ProjectMember" pm
JOIN "public"."WorkspaceMember" wm ON wm."id" = pm."workspaceMemberId"
WHERE t."reviewerId" = pm."id"
  AND wm."deactivatedAt" IS NOT NULL
  AND t."status" IS DISTINCT FROM 'COMPLETED';

UPDATE "public"."Project" AS p
SET "projectManagerId" = NULL
FROM "public"."WorkspaceMember" wm
WHERE p."projectManagerId" = wm."id"
  AND wm."deactivatedAt" IS NOT NULL;
