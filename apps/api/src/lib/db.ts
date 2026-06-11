import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/wasm";

/**
 * Creates a fresh PrismaClient backed by a per-request pg pool.
 *
 * max: 8 — view handlers run queries in Promise.all (kanban: 7, list facets: 2);
 * connections open lazily so simple requests still use one. PgBouncer (Supabase
 * port 6543) handles actual PostgreSQL connection reuse server-side, so each
 * connection only costs the TCP handshake to PgBouncer (~30-80ms).
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
        // Up to 8 connections per request — kanban fires 7 queries in Promise.all
        // (1 count + 6 per-status) and list/facets runs 2 in parallel. pg.Pool opens
        // connections lazily, so single-query requests still use just one.
        // PgBouncer / Hyperdrive recycle the server-side connections.
        max: 8,
        connectionTimeoutMillis: 20000,
    });

    const adapter = new PrismaPg(pool);
    const prisma = new PrismaClient({ adapter });
    (prisma as PrismaClient & { $pool: Pool }).$pool = pool;
    return prisma;
}

export type DbClient = PrismaClient;
