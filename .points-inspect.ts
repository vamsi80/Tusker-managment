// read-only inspection, deleted after use
import prisma from "./src/index";
async function main() {
  console.log("attendance rows by day + source (is any cron alive?):");
  console.table(await prisma.$queryRawUnsafe(`SELECT column_name FROM information_schema.columns WHERE table_name='attendance'`));
  console.log("managers and their active reports:");
  console.table(await prisma.$queryRawUnsafe(`
    SELECT u.surname, w.name ws, (SELECT count(*)::int FROM "WorkspaceMember" s WHERE s."reportToId"=m.id AND s."deactivatedAt" IS NULL) reports
    FROM "WorkspaceMember" m JOIN "user" u ON u.id=m."userId" JOIN "Workspace" w ON w.id=m."workspaceId"
    WHERE m."workspaceRole"='MANAGER' AND m."deactivatedAt" IS NULL ORDER BY 3`));
}
main().finally(() => prisma.$disconnect());
