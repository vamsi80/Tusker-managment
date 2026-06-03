import "server-only";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";

export const getSession = cache(async () => {
    try {
        return await auth.api.getSession({
            headers: await headers(),
        });
    } catch {
        // If the backend is unreachable or throws any error, treat as unauthenticated.
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
