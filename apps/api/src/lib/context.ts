import { createMiddleware } from "hono/factory";
import { createDbClient, type DbClient } from "./db";
import { createPusherClient } from "./pusher";
import { createAuth } from "./auth";
import { createEmailClient } from "./email";
import type { Env, HonoVariables } from "../types";
import type PusherServer from "pusher";
import type { Resend } from "resend";

export type AppServices = {
    db: DbClient;
    pusher: PusherServer | null;
    auth: ReturnType<typeof createAuth>;
    resend: Resend;
};

export type FullVariables = HonoVariables & AppServices;

export const servicesMiddleware = createMiddleware<{ Bindings: Env; Variables: FullVariables }>(
    async (c, next) => {
        const env = c.env;
        const db = await createDbClient(env.DATABASE_URL);

        const pusher = (env.PUSHER_APP_ID && env.PUSHER_KEY && env.PUSHER_SECRET && env.PUSHER_CLUSTER)
            ? createPusherClient({
                PUSHER_APP_ID: env.PUSHER_APP_ID,
                PUSHER_KEY: env.PUSHER_KEY,
                PUSHER_SECRET: env.PUSHER_SECRET,
                PUSHER_CLUSTER: env.PUSHER_CLUSTER,
            })
            : null;

        const auth = createAuth(env, db);
        const resend = createEmailClient(env.RESEND_API_KEY);

        c.set("db" as any, db);
        c.set("pusher" as any, pusher);
        c.set("auth" as any, auth);
        c.set("resend" as any, resend);
        c.set("env" as any, env);

        await next();
    }
);
