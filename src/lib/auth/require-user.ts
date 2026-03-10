import "server-only";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";

/**
 * Cached session getter — fast path via Better Auth's cookieCache.
 * 
 * Better Auth's cookieCache (5 min) validates sessions from the cookie
 * without DB round-trips. No retry logic needed — if session is invalid,
 * we redirect to sign-in immediately instead of retrying.
 */
export const getSession = cache(async () => {
    try {
        return await auth.api.getSession({
            headers: await headers(),
        });
    } catch (error) {
        if (error instanceof Error && error.message.includes('NEXT_REDIRECT')) {
            throw error;
        }

        return null;
    }
});

export const requireUser = async () => {
    const session = await getSession();

    if (!session) {
        return redirect('/sign-in');
    }

    return session.user;
};

