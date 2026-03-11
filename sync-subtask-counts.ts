import { PrismaClient } from "./src/generated/prisma/index.js";

const prisma = new PrismaClient();

async function main() {
    console.log("Syncing subtask counts...");

    // Find all parent tasks that have subtasks
    const parentTasks = await prisma.task.findMany({
        where: { isParent: true },
        select: {
            id: true,
            _count: {
                select: { subTasks: true }
            },
            subTasks: {
                select: { status: true }
            }
        }
    });

    let updatedCount = 0;

    for (const parent of parentTasks) {
        const totalSubtasks = parent._count.subTasks;
        const completedSubtasks = parent.subTasks.filter(st => st.status === "COMPLETED").length;

        await prisma.task.update({
            where: { id: parent.id },
            data: {
                subtaskCount: totalSubtasks,
                completedSubtaskCount: completedSubtasks
            }
        });
        
        updatedCount++;
    }

    console.log(`Successfully synced counts for ${updatedCount} parent tasks.`);
}

main()
    .catch(e => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
