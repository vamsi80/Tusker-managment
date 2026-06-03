import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/wasm";

export function createDbClient(connectionString: string): PrismaClient {
    const pool = new Pool({
        connectionString,
        ssl: connectionString.includes("sslmode=disable") ? false : { rejectUnauthorized: false },
        max: 5,
        // Keep connections warm between requests in the same Worker isolate
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 5000,
    });
    const adapter = new PrismaPg(pool);
    const prisma = new PrismaClient({ adapter });
    (prisma as any).$pool = pool;
    return prisma;
}

export type DbClient = PrismaClient;
