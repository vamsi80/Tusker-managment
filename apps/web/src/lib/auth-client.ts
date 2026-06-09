import { makeAuthClient } from "@tusker/auth/client";

// NEXT_PUBLIC_APP_URL = the web origin (no path). Better Auth builds
// baseURL + basePath + endpoint → /api/v1/auth/*, which Next.js rewrites proxy
// to the Hono Worker, keeping the session cookie first-party to the web origin.
export const authClient = makeAuthClient({
    baseURL: process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
});
