import { PrismaClient } from '../src/generated/prisma';

const prisma = new PrismaClient();

async function main() {
  console.log('Starting data migration for shared clients...');

  // 1. Get all clients and their legacy links
  const clients = await prisma.clints.findMany({
    include: {
      legacyProject: true
    }
  });

  console.log(`Found ${clients.length} clients to process.`);

  for (const client of clients) {
    if (client.projectId && client.legacyProject) {
      console.log(`Processing client ${client.name} for project ${client.legacyProject.name}`);

      // Update Clints with workspaceId
      await prisma.clints.update({
        where: { id: client.id },
        data: {
          workspaceId: client.legacyProject.workspaceId
        }
      });

      // Update Project with clintId
      await prisma.project.update({
        where: { id: client.projectId },
        data: {
          clintId: client.id
        }
      });
    } else {
      console.log(`Skipping client ${client.id} (no project link found)`);
    }
  }

  console.log('Data migration completed successfully.');
}

main()
  .catch((e) => {
    console.error('Migration failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
