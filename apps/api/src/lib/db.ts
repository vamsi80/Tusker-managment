import { PrismaClient } from "../generated/prisma";

export function createDbClient(connectionString: string): PrismaClient {
    return new PrismaClient({
        datasources: {
            db: { url: connectionString },
        },
        log: [{ level: "error", emit: "stdout" }],
    });
}

export type DbClient = PrismaClient;
