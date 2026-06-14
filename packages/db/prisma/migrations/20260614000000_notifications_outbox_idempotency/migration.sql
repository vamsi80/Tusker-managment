-- Additive, idempotent migration. Preserves all existing data: only ADD COLUMN, a one-time
-- backfill, CREATE INDEX, and CREATE TABLE. No DROP / no destructive ALTER. Safe to re-run.

-- 1. Idempotency key for notifications (dedup on retries).
ALTER TABLE "notification" ADD COLUMN IF NOT EXISTS "eventId" text;

-- Backfill existing rows with their own id so the unique index builds without conflict.
UPDATE "notification" SET "eventId" = "id" WHERE "eventId" IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "notification_userId_eventId_key"
  ON "notification" ("userId", "eventId");

-- Faster unread-count lookups.
CREATE INDEX IF NOT EXISTS "notification_userId_workspaceId_isRead_idx"
  ON "notification" ("userId", "workspaceId", "isRead");

-- 2. Transactional outbox for at-least-once realtime delivery.
CREATE TABLE IF NOT EXISTS "outbox" (
    "id"            text PRIMARY KEY,
    "workspaceId"   text NOT NULL,
    "event"         text NOT NULL,
    "payload"       jsonb NOT NULL,
    "targetUserIds" text[] NOT NULL DEFAULT '{}',
    "publishedAt"   timestamp(3),
    "attempts"      integer NOT NULL DEFAULT 0,
    "createdAt"     timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "outbox_publishedAt_createdAt_idx"
  ON "outbox" ("publishedAt", "createdAt");
