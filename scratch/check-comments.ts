import { PrismaClient } from '../src/generated/prisma/index.js';

const prisma = new PrismaClient();

async function main() {
  console.log('--- Subtask Comments in Database ---');
  
  const comments = await prisma.comment.findMany({
    include: {
      task: {
        select: {
          name: true,
          taskSlug: true,
          isParent: true,
        }
      },
      user: {
        select: {
          surname: true,
          email: true
        }
      }
    },
    orderBy: {
      createdAt: 'desc'
    }
  });

  if (comments.length === 0) {
    console.log('No comments found.');
  } else {
    comments.forEach(c => {
      console.log(`[${c.createdAt.toISOString()}]`);
      console.log(`User: ${c.user.surname} (${c.user.email})`);
      console.log(`Task: ${c.task.name} (${c.task.taskSlug}) ${c.task.isParent ? '[Parent]' : '[Subtask]'}`);
      console.log(`Content: "${c.content}"`);
      console.log(`Status: ${c.isDeleted ? 'DELETED' : 'ACTIVE'}`);
      console.log('-----------------------------------');
    });
  }
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
