-- Backfill active legacy indents with explicit owner choices without deleting
-- any records, approval IDs, rates, timestamps, or line items.
BEGIN;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "indent" i
    WHERE i."status"::text IN (
      'DRAFT',
      'SUBMITTED',
      'ASSIGNED',
      'PENDING_OWNER_APPROVAL',
      'PENDING_OWNER_COMPARATIVE_APPROVAL',
      'COMPARATIVES_IN_PROGRESS',
      'PENDING_MANAGER_FINAL_RATE_APPROVAL',
      'PENDING_OWNER_FINAL_APPROVAL',
      'REJECTED'
    )
      AND cardinality(i."approverIds") = 0
      AND NOT EXISTS (
        SELECT 1
        FROM "WorkspaceMember" wm
        WHERE wm."workspaceId" = i."workspaceId"
          AND wm."workspaceRole" = 'OWNER'
      )
  ) THEN
    RAISE EXCEPTION 'Cannot backfill active indents because a workspace has no owner';
  END IF;
END $$;

WITH owner_choices AS (
  SELECT
    i."id" AS indent_id,
    array_agg(wm."id" ORDER BY wm."createdAt", wm."id") AS owner_ids
  FROM "indent" i
  JOIN "WorkspaceMember" wm
    ON wm."workspaceId" = i."workspaceId"
   AND wm."workspaceRole" = 'OWNER'
  WHERE i."status"::text IN (
    'DRAFT',
    'SUBMITTED',
    'ASSIGNED',
    'PENDING_OWNER_APPROVAL',
    'PENDING_OWNER_COMPARATIVE_APPROVAL',
    'COMPARATIVES_IN_PROGRESS',
    'PENDING_MANAGER_FINAL_RATE_APPROVAL',
    'PENDING_OWNER_FINAL_APPROVAL',
    'REJECTED'
  )
    AND cardinality(i."approverIds") = 0
  GROUP BY i."id"
)
UPDATE "indent" i
SET
  "approverIds" = owner_choices.owner_ids,
  "status" = CASE
    WHEN i."status" = 'COMPARATIVES_IN_PROGRESS'
      AND NOT (owner_choices.owner_ids <@ i."approvedByIds")
    THEN 'PENDING_OWNER_COMPARATIVE_APPROVAL'::"IndentStatus"
    ELSE i."status"
  END
FROM owner_choices
WHERE i."id" = owner_choices.indent_id;

COMMIT;
