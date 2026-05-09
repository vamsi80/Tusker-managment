import { PrismaClient } from '../../generated/prisma';

const prisma = new PrismaClient();

async function main() {
  const users = await prisma.user.findMany({
    take: 10,
    select: {
      email: true,
      emailVerified: true,
    }
  });
  console.log(JSON.stringify(users, null, 2));
}

main()
  .catch(e => console.error(e))
  .finally(async () => await prisma.$disconnect());
