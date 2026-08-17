-- Keep this additive migration atomic: any failure rolls back every change.
BEGIN;

-- Add a dedicated view-only Accounts workspace role.
ALTER TYPE "WorkspaceRole" ADD VALUE IF NOT EXISTS 'ACCOUNTS';

-- Add the explicit approval stages used by the procurement workflow.
ALTER TYPE "IndentStatus" ADD VALUE IF NOT EXISTS 'PENDING_OWNER_COMPARATIVE_APPROVAL';
ALTER TYPE "IndentStatus" ADD VALUE IF NOT EXISTS 'COMPARATIVES_IN_PROGRESS';
ALTER TYPE "IndentStatus" ADD VALUE IF NOT EXISTS 'PENDING_MANAGER_FINAL_RATE_APPROVAL';
ALTER TYPE "IndentStatus" ADD VALUE IF NOT EXISTS 'PENDING_OWNER_FINAL_APPROVAL';
ALTER TYPE "IndentStatus" ADD VALUE IF NOT EXISTS 'REJECTED';

-- Preserve approximate rates and capture final manually-negotiated rates separately.
ALTER TABLE "indent_line_item" ADD COLUMN "finalUnitPrice" INTEGER;

-- Approval/revision audit fields. Existing approval fields remain valid for
-- the initial manager and final owner approvals.
ALTER TABLE "indent"
  ADD COLUMN "ownerAuthorizedAt" TIMESTAMP(3),
  ADD COLUMN "finalRatesSubmittedAt" TIMESTAMP(3),
  ADD COLUMN "finalRatesSubmittedById" TEXT,
  ADD COLUMN "finalManagerApprovedAt" TIMESTAMP(3),
  ADD COLUMN "finalManagerApprovedById" TEXT,
  ADD COLUMN "finalOwnerApprovedByIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "rejectedAt" TIMESTAMP(3),
  ADD COLUMN "rejectedById" TEXT,
  ADD COLUMN "rejectedFromStatus" TEXT,
  ADD COLUMN "rejectedStage" TEXT,
  ADD COLUMN "rejectionReason" TEXT,
  ADD COLUMN "revisionCount" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "indent"
  ADD CONSTRAINT "indent_finalRatesSubmittedById_fkey"
  FOREIGN KEY ("finalRatesSubmittedById") REFERENCES "WorkspaceMember"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "indent"
  ADD CONSTRAINT "indent_finalManagerApprovedById_fkey"
  FOREIGN KEY ("finalManagerApprovedById") REFERENCES "WorkspaceMember"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

COMMIT;
