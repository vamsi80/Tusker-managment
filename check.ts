import { PrismaClient } from "./src/generated/prisma/index.js";

const prisma = new PrismaClient();

async function main() {
    const parentWithSubtasks = await prisma.task.findFirst({
        where: { subtaskCount: { gt: 0 } },
        select: { id: true, name: true, subtaskCount: true }
    });
    console.log("One parent with >0 subtasks:", parentWithSubtasks);
}
main().finally(() => prisma.$disconnect());
