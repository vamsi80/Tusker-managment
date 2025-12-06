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
                console.warn(`[requireUser] Attempt ${attempt + 1} failed, retrying in ${delay}ms...`, {
                    error: error instanceof Error ? error.message : String(error),
                    attempt: attempt + 1,
                    maxRetries
                });
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }
    }

    console.error('[requireUser] All retry attempts failed', {
        error: lastError?.message,
        stack: lastError?.stack,
        maxRetries
    });
    throw lastError;
}

export const requireUser = cache(async () => {
    try {
        const session = await retryWithBackoff(async () => {
            return await auth.api.getSession({
                headers: await headers(),
            });
        });

        if (!session) {
            console.warn('[requireUser] No session found, redirecting to sign-in');
            return redirect('/sign-in');
        }

        return session.user;
    } catch (error) {
        // Log the error with context
        console.error('[requireUser] Session fetch failed', {
            error: error instanceof Error ? error.message : String(error),
            stack: error instanceof Error ? error.stack : undefined,
            timestamp: new Date().toISOString()
        });

        // If it's a redirect error, re-throw it
        if (error instanceof Error && error.message.includes('NEXT_REDIRECT')) {
            throw error;
        }

        // For all other errors, redirect to sign-in
        return redirect('/sign-in?error=session-failed');
    }
});
