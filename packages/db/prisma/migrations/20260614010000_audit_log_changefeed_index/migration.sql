-- Additive, idempotent: composite index for the polling change-feed query
-- (SELECT ... FROM audit_log WHERE "workspaceId" = $1 AND "createdAt" > $2 ORDER BY "createdAt").
CREATE INDEX IF NOT EXISTS "audit_log_workspaceId_createdAt_idx"
  ON "audit_log" ("workspaceId", "createdAt");
