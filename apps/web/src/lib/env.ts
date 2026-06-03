import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

export const env = createEnv({
    server: {
        NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
        CRON_SECRET: z.string().optional(),
    },

    client: {
        NEXT_PUBLIC_API_URL: z.string().url().optional(),
        NEXT_PUBLIC_APP_URL: z.string().url().optional(),
        NEXT_PUBLIC_S3_BUCKET_NAME: z.string().min(1).optional(),
        NEXT_PUBLIC_PUSHER_KEY: z.string().min(1).optional(),
        NEXT_PUBLIC_PUSHER_CLUSTER: z.string().min(1).optional(),
    },

    runtimeEnv: {
        NODE_ENV: process.env.NODE_ENV,
        CRON_SECRET: process.env.CRON_SECRET,
        NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL,
        NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
        NEXT_PUBLIC_S3_BUCKET_NAME: process.env.NEXT_PUBLIC_S3_BUCKET_NAME,
        NEXT_PUBLIC_PUSHER_KEY: process.env.NEXT_PUBLIC_PUSHER_KEY,
        NEXT_PUBLIC_PUSHER_CLUSTER: process.env.NEXT_PUBLIC_PUSHER_CLUSTER,
    },

    skipValidation: !!process.env.SKIP_ENV_VALIDATION || process.env.NODE_ENV === "development",
    emptyStringAsUndefined: true,
});
