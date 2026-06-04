import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/wasm";

/**
 * Creates a fresh PrismaClient backed by a single pg connection for this request.
 *
 * max: 1 — one connection per request is enough (queries within a request are sequential).
 * PgBouncer (Supabase port 6543) handles actual PostgreSQL connection reuse server-side,
 * so creating a new Pool per request only costs the TCP handshake to PgBouncer (~30-80ms).
 *
 * connectionTimeoutMillis: 20s — allows cold-start TCP + TLS to Supabase Mumbai.
 * Warm requests connect in <100ms (PgBouncer already has connections ready).
 */
export function createDbClient(connectionString: string): PrismaClient {
    // Add server-side connect_timeout as an extra safety net
    const connStr = connectionString.includes("connect_timeout=")
        ? connectionString
        : connectionString + (connectionString.includes("?") ? "&" : "?") + "connect_timeout=30";

    const pool = new Pool({
        connectionString: connStr,
        ssl: connectionString.includes("sslmode=disable") ? false : { rejectUnauthorized: true },
        // Single connection per request — sequential queries don't need a pool.
        // Cloudflare Workers cannot share TCP connections across requests anyway.
        max: 1,
        connectionTimeoutMillis: 20000,
    });

    const adapter = new PrismaPg(pool);
    const prisma = new PrismaClient({ adapter });
    (prisma as any).$pool = pool;
    return prisma;
}

export type DbClient = PrismaClient;
