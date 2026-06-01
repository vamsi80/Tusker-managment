import { PrismaClient } from "../src/generated/prisma";

const prisma = new PrismaClient();

async function main() {
  console.log("🚀 Starting Project Tag Migration...");

  // Fetch all projects and their current tags
  const projects = await prisma.project.findMany({
    include: {
      tags: {
        select: {
          id: true,
        },
      },
    },
  });

  console.log(`Found ${projects.length} projects to analyze.`);

  for (const project of projects) {
    // Find all tasks and subtasks belonging to this project that have tags
    const tasks = await prisma.task.findMany({
      where: {
        projectId: project.id,
      },
      include: {
        tags: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    // Extract all unique tag IDs from the tasks
    const usedTagIds = Array.from(
      new Set(tasks.flatMap((t) => t.tags.map((tag) => tag.id)))
    );

    const existingTagIds = project.tags.map((t) => t.id);
    const tagsToConnect = usedTagIds.filter((id) => !existingTagIds.includes(id));

    if (tagsToConnect.length > 0) {
      console.log(
        `Syncing ${tagsToConnect.length} tag(s) to project: "${project.name}" (ID: ${project.id})`
      );
      
      await prisma.project.update({
        where: {
          id: project.id,
        },
        data: {
          tags: {
            connect: tagsToConnect.map((id) => ({ id })),
          },
        },
      });
    } else {
      console.log(`Project "${project.name}" has no missing tags to sync.`);
    }
  }

  console.log("✅ Migration complete!");
}

main()
  .catch((e) => {
    console.error("❌ Migration failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
