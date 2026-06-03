import { createDbClient, type DbClient } from "./db";
import { createPusherClient } from "./pusher";
import { createAuth } from "./auth";
import { createEmailClient } from "./email";
import type { Env } from "../types";
import type PusherServer from "pusher";
import type { Resend } from "resend";

// Module-level singletons — persist across requests in the same CF Worker isolate.
// First request pays the pool init cost (~400ms); all subsequent requests reuse warm connections.
let _db: DbClient | null = null;
let _auth: ReturnType<typeof createAuth> | null = null;
let _pusher: PusherServer | null = null;
let _resend: Resend | null = null;
let _env: Env | null = null;

export function initServices(env: Env) {
    _env = env;

    // DB + Auth: create once, reuse forever within this isolate
    if (!_db) {
        _db = createDbClient(env.DATABASE_URL);
    }
    if (!_auth) {
        _auth = createAuth(env, _db);
    }

    if (!_pusher && env.PUSHER_APP_ID && env.PUSHER_KEY && env.PUSHER_SECRET && env.PUSHER_CLUSTER) {
        _pusher = createPusherClient({
            PUSHER_APP_ID: env.PUSHER_APP_ID,
            PUSHER_KEY: env.PUSHER_KEY,
            PUSHER_SECRET: env.PUSHER_SECRET,
            PUSHER_CLUSTER: env.PUSHER_CLUSTER,
        });
    }
    if (!_resend && env.RESEND_API_KEY) {
        _resend = createEmailClient(env.RESEND_API_KEY);
    }
}

// runRequestContext is now a thin pass-through — no pool creation or cleanup.
// The pool stays alive for the next request automatically.
export async function runRequestContext<T>(env: Env, callback: () => Promise<T>): Promise<T> {
    if (!_db || !_auth) {
        initServices(env);
    }
    return callback();
}

export function getDb(): DbClient {
    if (!_db) throw new Error("DB not initialized — call initServices(env) first");
    return _db;
}

export function getAuth(): ReturnType<typeof createAuth> {
    if (!_auth) throw new Error("Auth not initialized — call initServices(env) first");
    return _auth;
}

export function getPusher(): PusherServer | null {
    if (!_pusher) {
        const appId = _env?.PUSHER_APP_ID || process.env.PUSHER_APP_ID;
        const key = _env?.PUSHER_KEY || process.env.PUSHER_KEY;
        const secret = _env?.PUSHER_SECRET || process.env.PUSHER_SECRET;
        const cluster = _env?.PUSHER_CLUSTER || process.env.PUSHER_CLUSTER;
        if (appId && key && secret && cluster) {
            _pusher = createPusherClient({ PUSHER_APP_ID: appId, PUSHER_KEY: key, PUSHER_SECRET: secret, PUSHER_CLUSTER: cluster });
        }
    }
    return _pusher;
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
