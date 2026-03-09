import "server-only";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";

/**
 * Retry helper with exponential backoff
 */
async function retryWithBackoff<T>(
    fn: () => Promise<T>,
    maxRetries = 3,
    baseDelay = 100
): Promise<T> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
            return await fn();
        } catch (error) {
            lastError = error as Error;

            // Don't retry on auth errors, only on network/DB errors
            if (error instanceof Error && error.message.includes('redirect')) {
                throw error;
            }

            if (attempt < maxRetries - 1) {
                const delay = baseDelay * Math.pow(2, attempt);
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }
    }

    throw lastError;
}

export const getSession = cache(async () => {
    try {
        return await retryWithBackoff(async () => {
            return await auth.api.getSession({
                headers: await headers(),
            });
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
