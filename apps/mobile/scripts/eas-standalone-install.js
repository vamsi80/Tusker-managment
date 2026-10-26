// EAS Build runs `pnpm install` in apps/mobile, but pnpm finds the repo-root
// pnpm-workspace.yaml and installs the whole monorepo instead (its Prisma
// postinstall then fails on the build worker). This app is deliberately
// outside the workspace, so drop the workspace file from the build worker's
// copy of the repo and let pnpm install from apps/mobile/pnpm-lock.yaml alone.
// Only EAS runs this hook; local checkouts are untouched.
const fs = require("fs");
const path = require("path");

if (!process.env.EAS_BUILD) {
    console.log("[eas-standalone-install] not on EAS Build, skipping");
    process.exit(0);
}

const workspaceFile = path.resolve(__dirname, "../../../pnpm-workspace.yaml");
fs.rmSync(workspaceFile, { force: true });
console.log(`[eas-standalone-install] removed ${workspaceFile}`);
