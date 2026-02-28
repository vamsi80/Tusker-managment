import { PrismaClient } from './src/generated/prisma';

async function main() {
    const prisma = new PrismaClient();
    try {
        const ws = await prisma.workspace.findFirst();
        if (!ws) {
            console.log("No workspace found.");
            return;
        }

        console.log(`Analyzing search query in workspace ${ws.id}...`);

        const query = `
      EXPLAIN ANALYZE
      SELECT * FROM "Task"
      WHERE "workspaceId" = '${ws.id}'
      AND ("name" ILIKE '%test%' OR "description" ILIKE '%test%')
      ORDER BY "createdAt" DESC
      LIMIT 20;
    `;

        const result = await prisma.$queryRawUnsafe<any[]>(query);
        console.log("Execution Plan:");
        if (result && Array.isArray(result)) {
            require('fs').writeFileSync('query_plan_log.txt', result.map(row => row["QUERY PLAN"]).join('\n'));
            result.forEach(row => {
                console.log(row["QUERY PLAN"]);
            });
        }

    } catch (error) {
        console.error("Error running EXPLAIN ANALYZE:", error);
    } finally {
        await prisma.$disconnect();
    }
}

main();
