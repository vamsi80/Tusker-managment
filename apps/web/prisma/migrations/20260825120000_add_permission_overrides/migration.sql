-- Settings -> Permissions: per-role and per-member capability deltas.
-- Both nullable and additive; NULL means "use the built-in role defaults",
-- so existing rows keep behaving exactly as they did before this migration.
ALTER TABLE "Workspace" ADD COLUMN "permissionOverrides" JSONB;
ALTER TABLE "WorkspaceMember" ADD COLUMN "permissionOverrides" JSONB;
