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
export function createDbClient(source: string | Hyperdrive): PrismaClient {
    const isHyperdrive = typeof source !== "string";
    const rawConnStr = isHyperdrive ? (source as Hyperdrive).connectionString : source;

    // Only append connect_timeout for direct connections — Hyperdrive manages its own timeouts
    const connStr = isHyperdrive || rawConnStr.includes("connect_timeout=")
        ? rawConnStr
        : rawConnStr + (rawConnStr.includes("?") ? "&" : "?") + "connect_timeout=30";

    const pool = new Pool({
        connectionString: connStr,
        // sslmode=disable wins regardless of source (local dev emulation uses PgBouncer with SSL off)
        // Production Hyperdrive connection string won't have sslmode=disable, so it gets rejectUnauthorized:false
        ssl: rawConnStr.includes("sslmode=disable")
            ? false
            : isHyperdrive
            ? { rejectUnauthorized: false }   // Hyperdrive proxy: no cert verification needed
            : { rejectUnauthorized: true },   // direct DB: verify cert
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
