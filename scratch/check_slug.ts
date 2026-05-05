import { PrismaClient } from "../src/generated/prisma";

async function main() {
  const prisma = new PrismaClient();
  const slug = "e8bc35eb-94ec-4574-a1df-e164d438be5b";
  const workspaceId = "846e17c7-d85f-4453-9ca0-0acc7bfce49c";

  console.log(`Checking task with slug: ${slug} in workspace: ${workspaceId}`);

  const task = await prisma.task.findFirst({
    where: {
      workspaceId,
      OR: [
        { id: slug },
        { taskSlug: slug }
      ]
    },
    select: {
      id: true,
      name: true,
      taskSlug: true,
      workspaceId: true
    }
  });

  if (task) {
    console.log("SUCCESS: Task found!");
    console.log(JSON.stringify(task, null, 2));
  } else {
    console.log("FAILURE: Task not found.");
    
    // Let's try to find it just by slug without workspaceId to see if it moved?
    const globalTask = await prisma.task.findFirst({
      where: { taskSlug: slug },
      select: { id: true, name: true, taskSlug: true, workspaceId: true }
    });
    
    if (globalTask) {
        console.log("FOUND in DIFFERENT workspace:");
        console.log(JSON.stringify(globalTask, null, 2));
    } else {
        console.log("NOT FOUND globally either.");
        
        // Search by name similarity
        const similarTasks = await prisma.task.findMany({
            where: { name: { contains: "tally", mode: "insensitive" } },
            select: { id: true, name: true, taskSlug: true, workspaceId: true },
            take: 5
        });
        console.log(`Found ${similarTasks.length} similar tasks:`);
        console.log(JSON.stringify(similarTasks, null, 2));
    }
  }

  await prisma.$disconnect();
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
