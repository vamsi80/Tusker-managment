import type { User, Session } from "better-auth";

// Better Auth's User type only covers standard fields.
// TuskerUser adds our custom Prisma columns that are always present at runtime.
export type TuskerUser = User & {
    surname: string;
};

export type Env = {
    // Database
    DATABASE_URL: string;
    // HYPERDRIVE: Hyperdrive; // Uncomment after setting up Cloudflare Hyperdrive

    // Auth
    BETTER_AUTH_SECRET: string;
    BETTER_AUTH_URL: string;

    // OAuth
    AUTH_GITHUB_CLIENT_ID: string;
    AUTH_GITHUB_SECRET: string;
    GOOGLE_CLIENT_ID: string;
    GOOGLE_CLIENT_SECRET: string;

    // Email (Resend)
    RESEND_API_KEY: string;
    RESEND_FROM_EMAIL: string;

    // Pusher
    PUSHER_APP_ID: string;
    PUSHER_KEY: string;
    PUSHER_SECRET: string;
    PUSHER_CLUSTER: string;

    // AWS S3
    AWS_ACCESS_KEY_ID: string;
    AWS_SECRET_ACCESS_KEY: string;
    AWS_REGION: string;
    AWS_S3_BUCKET_NAME: string;

    // Misc
    CRON_SECRET?: string;
    APP_URL: string;
    ALLOWED_ORIGINS?: string;
    ENVIRONMENT: "development" | "production" | "staging";
    DIRECT_URL?: string;
};

export type HonoVariables = {
    user: TuskerUser;
    session: Session;
    env: Env;
};
