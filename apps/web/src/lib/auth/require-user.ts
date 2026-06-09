import "server-only";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import type { Auth } from "@tusker/auth/types";
import { getApiBaseUrl } from "@/lib/api-client/base-url";

// Exact shape returned by the single auth server's get-session (incl. plugin fields).
type SessionData = Awaited<ReturnType<Auth["api"]["getSession"]>>;

/**
 * Read the current session from the single auth server (the Worker).
 *
 * The web app is a pure Better Auth *client*: it owns no betterAuth() instance
 * and no auth DB access. We forward the incoming cookies to the Worker's
 * get-session endpoint, where they're signature-verified by the shared secret.
 *
 * Uses a raw fetch (NOT serverApiFetch) on purpose — serverApiFetch calls
 * getSession() to attach a Bearer token, so routing this through it would loop.
 * `cache()` dedupes to a single Worker round-trip per request.
 */
export const getSession = cache(async (): Promise<SessionData> => {
    try {
        const cookie = (await headers()).get("cookie") ?? "";
        if (!cookie) return null;

        const res = await fetch(`${getApiBaseUrl()}/auth/get-session`, {
            headers: { cookie },
            cache: "no-store",
        });
        if (!res.ok) return null;

        const data = (await res.json()) as SessionData;
        if (!data || !data.user) return null;
        return data;
    } catch {
        // Backend unreachable or any error → treat as unauthenticated.
        return null;
    }
});

export const requireUser = async () => {
    const session = await getSession();

    if (!session) {
        return redirect("/sign-in");
    }

    return session.user;
};
