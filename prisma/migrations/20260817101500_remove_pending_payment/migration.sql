-- Remove the obsolete Accounts/payment stage without losing legacy indents.
BEGIN;

-- Under the former workflow, PENDING_PAYMENT was reached only after owner
-- approval. Those indents now continue directly with comparative collection.
UPDATE "indent"
SET
  "status" = 'COMPARATIVES_IN_PROGRESS',
  "ownerAuthorizedAt" = COALESCE("ownerAuthorizedAt", "finalApprovedAt", "updatedAt")
WHERE "status" = 'PENDING_PAYMENT';

-- PostgreSQL enum values cannot be dropped directly, so replace the enum after
-- migrating every row away from the obsolete value.
ALTER TABLE "indent" ALTER COLUMN "status" DROP DEFAULT;

CREATE TYPE "IndentStatus_without_pending_payment" AS ENUM (
  'DRAFT',
  'SUBMITTED',
  'PENDING_OWNER_APPROVAL',
  'PENDING_OWNER_COMPARATIVE_APPROVAL',
  'COMPARATIVES_IN_PROGRESS',
  'PENDING_MANAGER_FINAL_RATE_APPROVAL',
  'PENDING_OWNER_FINAL_APPROVAL',
  'ASSIGNED',
  'APPROVED',
  'REJECTED',
  'CANCELLED'
);

ALTER TABLE "indent"
  ALTER COLUMN "status" TYPE "IndentStatus_without_pending_payment"
  USING ("status"::TEXT::"IndentStatus_without_pending_payment");

DROP TYPE "IndentStatus";
ALTER TYPE "IndentStatus_without_pending_payment" RENAME TO "IndentStatus";

ALTER TABLE "indent"
  ALTER COLUMN "status" SET DEFAULT 'DRAFT'::"IndentStatus";

COMMIT;
