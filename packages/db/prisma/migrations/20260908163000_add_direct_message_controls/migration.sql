ALTER TABLE "direct_message"
  ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "deliveredAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "readAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "editedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "isForwarded" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "forwardedFromId" TEXT;

CREATE TABLE IF NOT EXISTS "DirectMessageDeletion" (
  "messageId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "deletedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DirectMessageDeletion_pkey" PRIMARY KEY ("messageId", "userId")
);

-- The table lives in Supabase's exposed public schema but is only accessed by
-- the authenticated application server. RLS blocks direct Data API access.
ALTER TABLE "DirectMessageDeletion" ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS "direct_message_conversationId_updatedAt_idx"
  ON "direct_message"("conversationId", "updatedAt");
CREATE INDEX IF NOT EXISTS "direct_message_forwardedFromId_idx"
  ON "direct_message"("forwardedFromId");
CREATE INDEX IF NOT EXISTS "DirectMessageDeletion_userId_idx"
  ON "DirectMessageDeletion"("userId");

ALTER TABLE "direct_message"
  ADD CONSTRAINT "direct_message_forwardedFromId_fkey"
  FOREIGN KEY ("forwardedFromId") REFERENCES "direct_message"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "DirectMessageDeletion"
  ADD CONSTRAINT "DirectMessageDeletion_messageId_fkey"
  FOREIGN KEY ("messageId") REFERENCES "direct_message"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "DirectMessageDeletion"
  ADD CONSTRAINT "DirectMessageDeletion_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "user"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
