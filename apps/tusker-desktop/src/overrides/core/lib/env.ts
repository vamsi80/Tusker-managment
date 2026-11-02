/**
 * Stands in for packages/core/src/lib/env.ts in the desktop renderer: the
 * original validates server secrets (DATABASE_URL, …) at import time, which a
 * window never has. Only the public values the website's browser code reads.
 */
export const env = {
    NODE_ENV: import.meta.env.MODE === "production" ? "production" : "development",
    NEXT_PUBLIC_PUSHER_KEY: (import.meta.env.VITE_PUSHER_KEY || "0203f5f8bc12eb473338").trim() || undefined,
    NEXT_PUBLIC_PUSHER_CLUSTER: (import.meta.env.VITE_PUSHER_CLUSTER ?? "ap2").trim(),
    NEXT_PUBLIC_APP_URL: "https://tusker-managment.vercel.app",
} as Record<string, string | undefined>;
