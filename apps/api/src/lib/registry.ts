import { AsyncLocalStorage } from "node:async_hooks";
import { createDbClient, type DbClient } from "./db";
import { createAuth } from "./auth";
import { createEmailClient } from "./email";
import type { Env } from "../types";
import type { Resend } from "resend";

/**
 * WHY per-request DB/auth (not singletons):
 *
 * Cloudflare Workers enforces strict I/O context isolation between requests.
 * pg.Pool holds TCP sockets (via pg-cloudflare's CloudflareSocket) that are
 * bound to the I/O context of the request that created them. Sharing a Pool
 * across requests causes:
 *   "Cannot perform I/O on behalf of a different request."
 *
 * Solution: create a fresh Pool + PrismaClient per request, stored in
 * AsyncLocalStorage so all code in the request tree can access it via getDb().
 * PgBouncer (Supabase port 6543) handles actual PostgreSQL connection reuse
 * server-side, so the per-request TCP connection to PgBouncer is fast (~30-80ms).
 *
 * WHY Resend is a singleton:
 * It uses HTTP (fetch), which is NOT I/O-context scoped. Safe to share.
 * WS_SERVICE (Service Binding to tusker-ws) is accessed directly from _env — no singleton needed.
 */

interface RequestStore {
    db: DbClient;
    auth: ReturnType<typeof createAuth>;
}

const requestStorage = new AsyncLocalStorage<RequestStore>();

// HTTP-based singletons — safe to reuse across requests
let _resend: Resend | null = null;
let _env: Env | null = null;

/**
 * Wraps every request in a fresh DB + auth context.
 * Called once in the global middleware in index.ts.
 */
export async function runRequestContext<T>(env: Env, callback: () => Promise<T>): Promise<T> {
    _env = env;

    // Initialize HTTP-based singletons on first call
    if (!_resend && env.RESEND_API_KEY) {
        _resend = createEmailClient(env.RESEND_API_KEY);
    }

    // Fresh TCP pool + auth for THIS request
    // Use Hyperdrive in production (persistent edge connections); fall back to DATABASE_URL in local dev
    const db = createDbClient(env.HYPERDRIVE ?? env.DATABASE_URL);
    const auth = createAuth(env, db);

    return requestStorage.run({ db, auth }, async () => {
        try {
            return await callback();
        } finally {
            // End the pool so pg-cloudflare releases the TCP connection cleanly.
            // PgBouncer recycles it immediately for the next client.
            const pool = (db as any).$pool;
            if (pool) {
                pool.end().catch(() => {});
            }
        }
    });
}

export function getDb(): DbClient {
    const store = requestStorage.getStore();
    if (!store) throw new Error("DB not initialized — call runRequestContext first");
    return store.db;
}

export function getAuth(): ReturnType<typeof createAuth> {
    const store = requestStorage.getStore();
    if (!store) throw new Error("Auth not initialized — call runRequestContext first");
    return store.auth;
}

export function getResend(): Resend | null {
    if (!_resend) {
        const apiKey = _env?.RESEND_API_KEY || process.env.RESEND_API_KEY;
        if (apiKey) _resend = createEmailClient(apiKey);
    }
    return _resend;
}

export function getEnv(): Env {
    return _env ?? (process.env as unknown as Env);
}

/** Kept for backward-compat (called in index.ts before runRequestContext). No-op now. */
export function initServices(env: Env) {
    _env = env;
}
