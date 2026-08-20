import { PrismaClient } from './src/generated/prisma';
const prisma = new PrismaClient();
async function main() {
  const logs = await prisma.auditLog.findMany({
    where: { action: 'ATTENDANCE_SETTINGS_UPDATED' },
    orderBy: { createdAt: 'desc' },
    take: 2
  });
  console.log(JSON.stringify(logs, null, 2));
}
main().finally(() => prisma.$disconnect());
