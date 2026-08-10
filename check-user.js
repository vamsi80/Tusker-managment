const { PrismaClient } = require('./src/generated/prisma');
const prisma = new PrismaClient();
async function main() {
  const user = await prisma.user.findUnique({ where: { email: 'accounts@thewhitetusker.com' } });
  if (user) {
    const members = await prisma.workspaceMember.findMany({ where: { userId: user.id } });
    console.log('User:', user.email);
    console.log('Roles in workspaces:', members.map(m => m.workspaceRole));
  } else {
    console.log('User accounts@thewhitetusker.com not found');
  }
}
main().finally(() => prisma.$disconnect());
