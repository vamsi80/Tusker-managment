import { PrismaClient } from './src/generated/prisma';
import { TASK_CORE_SELECT } from './src/lib/tasks/query-builder';

async function main() {
    const prisma = new PrismaClient();
    const workspaceId = '52dd2e07-c2a0-46ce-960a-65299f72eebc';

    const iterations = 3;

    try {
        console.log(`Running benchmarks for Workspace: ${workspaceId}\n`);

        // 1. SIMULATE _fetchFilteredHierarchy (Multiple Steps)
        console.log("--- Strategy 1: Multi-Step Hierarchy (Simulation) ---");
        let totalHierarchyTime = 0;
        for (let i = 0; i < iterations; i++) {
            const start = performance.now();

            // Step 1: Find match primary IDs
            const matches = await prisma.task.findMany({
                where: { workspaceId },
                select: { id: true, parentTaskId: true },
                take: 100
            });

            const parentIds = Array.from(new Set(matches.map(m => m.parentTaskId || m.id))).slice(0, 20);

            // Step 2: Fetch Parents
            const rawParents = await prisma.task.findMany({
                where: { id: { in: parentIds } },
                select: TASK_CORE_SELECT
            });

            // Step 3: Fetch matching tasks
            const matchingTasks = await prisma.task.findMany({
                where: {
                    workspaceId,
                    OR: [
                        { id: { in: parentIds } },
                        { parentTaskId: { in: parentIds } }
                    ]
                },
                select: TASK_CORE_SELECT
            });

            const end = performance.now();
            totalHierarchyTime += (end - start);
        }
        const multiTime = (totalHierarchyTime / iterations).toFixed(2);
        console.log(`Average Multi-Step Time: ${multiTime}ms`);

        // 2. SIMULATE Simplified Raw Fetch (Single Step)
        console.log("--- Strategy 2: Single Raw findMany ---");
        let totalRawTime = 0;
        for (let i = 0; i < iterations; i++) {
            const start = performance.now();

            const rawTasks = await prisma.task.findMany({
                where: { workspaceId },
                select: TASK_CORE_SELECT,
                take: 20
            });
            console.log(`  Fetched ${rawTasks.length} tasks directly.`);

            const end = performance.now();
            totalRawTime += (end - start);
        }
        const singleTime = (totalRawTime / iterations).toFixed(2);
        console.log(`Average Single-Step Time: ${singleTime}ms`);

        const summary = `
Hierarchy Fetch: ${multiTime}ms
Raw Fetch: ${singleTime}ms
Speedup: ${(parseFloat(multiTime) / parseFloat(singleTime)).toFixed(1)}x
    `;
        require('fs').writeFileSync('final_benchmark_summary.txt', summary);

    } catch (error) {
        console.error("Benchmark failed:", error);
    } finally {
        await prisma.$disconnect();
    }
}

main();
