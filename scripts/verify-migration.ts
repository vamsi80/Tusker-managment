import { PrismaClient } from '../src/generated/prisma';
import * as dotenv from 'dotenv';
dotenv.config();

const prisma = new PrismaClient();

async function verify() {
  console.log('Verifying migration...');

  try {
    const tasks = await prisma.task.findMany({
      take: 1,
      include: {
        assignee: {
          include: {
            workspaceMember: {
              include: {
                user: true
              }
            }
          }
        },
        createdBy: {
          include: {
            workspaceMember: {
              include: {
                user: true
              }
            }
          }
        }
      }
    });

    if (tasks.length === 0) {
      console.log('No tasks found to verify.');
    } else {
      console.log('Sample Task Resolution:');
      const t = tasks[0];
      console.log(`Task ID: ${t.id}`);
      console.log(`Created By (ProjectMember ID): ${t.createdById}`);
      console.log(`Created By (Real User Name): ${t.createdBy?.workspaceMember?.user?.name}`);
      console.log(`Assignee (ProjectMember ID): ${t.assigneeId}`);
      console.log(`Assignee (Real User Name): ${t.assignee?.workspaceMember?.user?.name}`);
      
      if (t.assigneeId && !t.assignee) {
          console.error('CRITICAL: assigneeId is set but relation failed to resolve!');
      }
    }

    const indents = await prisma.indentDetails.findMany({
        take: 1,
        include: {
            assignee: {
                include: {
                    user: true
                }
            }
        }
    });

    if (indents.length > 0) {
        console.log('\nSample Indent Resolution:');
        const id = indents[0];
        console.log(`Indent ID: ${id.id}`);
        console.log(`Assigned To (WorkspaceMember ID): ${id.assignedTo}`);
        console.log(`Assigned To (Real User Name): ${id.assignee?.user?.name}`);
    }

  } catch (error) {
    console.error('Verification failed:', error);
  } finally {
    await prisma.$disconnect();
  }
}

verify();
