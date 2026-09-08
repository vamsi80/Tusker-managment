-- Keep this schema-qualified so pooled Supabase connections cannot resolve it
-- into a session-local schema. This is idempotent for fresh databases where
-- the preceding migration already created the table.
CREATE TABLE IF NOT EXISTS "public"."DirectMessageDeletion" (
  "messageId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "deletedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DirectMessageDeletion_pkey" PRIMARY KEY ("messageId", "userId")
);

ALTER TABLE "public"."DirectMessageDeletion" ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS "DirectMessageDeletion_userId_idx"
  ON "public"."DirectMessageDeletion"("userId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'DirectMessageDeletion_messageId_fkey'
      AND conrelid = '"public"."DirectMessageDeletion"'::regclass
  ) THEN
    ALTER TABLE "public"."DirectMessageDeletion"
      ADD CONSTRAINT "DirectMessageDeletion_messageId_fkey"
      FOREIGN KEY ("messageId") REFERENCES "public"."direct_message"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'DirectMessageDeletion_userId_fkey'
      AND conrelid = '"public"."DirectMessageDeletion"'::regclass
  ) THEN
    ALTER TABLE "public"."DirectMessageDeletion"
      ADD CONSTRAINT "DirectMessageDeletion_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "public"."user"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
