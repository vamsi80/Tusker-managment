import { createDbClient, type DbClient } from "./db";
import { createPusherClient } from "./pusher";
import { createAuth } from "./auth";
import { createEmailClient } from "./email";
import type { Env } from "../types";
import type PusherServer from "pusher";
import type { Resend } from "resend";

// Module-level singletons — initialized once from the first request's env
// CF Worker isolates run single-threaded so this is safe
let _db: DbClient | null = null;
let _pusher: PusherServer | null = null;
let _auth: ReturnType<typeof createAuth> | null = null;
let _resend: Resend | null = null;
let _env: Env | null = null;

export function initServices(env: Env) {
    _env = env;
    if (!_db) {
        _db = createDbClient(env.DATABASE_URL);
    }
    if (!_pusher && env.PUSHER_APP_ID && env.PUSHER_KEY && env.PUSHER_SECRET && env.PUSHER_CLUSTER) {
        _pusher = createPusherClient({
            PUSHER_APP_ID: env.PUSHER_APP_ID,
            PUSHER_KEY: env.PUSHER_KEY,
            PUSHER_SECRET: env.PUSHER_SECRET,
            PUSHER_CLUSTER: env.PUSHER_CLUSTER,
        });
    }
    if (!_auth) {
        _auth = createAuth(env);
    }
    if (!_resend && env.RESEND_API_KEY) {
        _resend = createEmailClient(env.RESEND_API_KEY);
    }
}

export function getDb(): DbClient {
    if (!_db) throw new Error("DB not initialized — call initServices first");
    return _db;
}

export function getPusher(): PusherServer | null {
    return _pusher;
}

export function getAuth(): ReturnType<typeof createAuth> {
    if (!_auth) throw new Error("Auth not initialized — call initServices first");
    return _auth;
}

export function getResend(): Resend | null {
    return _resend;
}

export function getEnv(): Env {
    if (!_env) throw new Error("Env not initialized — call initServices first");
    return _env;
}
