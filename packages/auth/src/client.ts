import { createAuthClient } from "better-auth/react";
import { emailOTPClient, adminClient, phoneNumberClient } from "better-auth/client/plugins";

/**
 * Build the browser auth client.
 *
 * `baseURL` is the web app's OWN origin (e.g. http://localhost:3000). Better Auth
 * builds `baseURL + basePath + endpoint`, and Next.js rewrites proxy `/api/v1/*`
 * to the Worker — so the session cookie stays first-party to the web origin.
 *
 * The plugin set MUST mirror the server (`createAuth`) for correct type inference.
 */
export function makeAuthClient(opts: { baseURL: string; basePath?: string }) {
    return createAuthClient({
        baseURL: opts.baseURL,
        basePath: opts.basePath ?? "/api/v1/auth",
        fetchOptions: {
            credentials: "include",
        },
        plugins: [emailOTPClient(), adminClient(), phoneNumberClient()],
    });
}

export type AuthClient = ReturnType<typeof makeAuthClient>;
