const { PrismaClient } = require('./src/generated/prisma');
const prisma = new PrismaClient();

async function main() {
  const records = await prisma.attendance.findMany({
    orderBy: { date: 'desc' },
    take: 5,
    include: {
      WorkspaceMember: {
        include: {
          user: true
        }
      }
    }
  });

  console.log(JSON.stringify(records, null, 2));
}

main().catch(console.error).finally(() => prisma.$disconnect());
