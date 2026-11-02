/**
 * Desktop stand-in for apps/web/src/lib/auth/require-user.ts. The website reads
 * the session cookie on the server; here the session comes from the API with the
 * app's token (through the fetch bridge). Same exports and return shapes.
 */
import { redirect } from "next/navigation";

type Session = { user: { id: string; name: string; email: string; image?: string | null; [k: string]: unknown }; session: Record<string, unknown> };

// One request serves a whole page: pages and their sections each ask for the session.
let cached: { at: number; promise: Promise<Session | null> } | null = null;

export const getSession = async (): Promise<Session | null> => {
    if (!cached || Date.now() - cached.at > 30_000) {
        cached = {
            at: Date.now(),
            promise: fetch("/api/v1/auth/get-session")
                .then(async (res) => (res.ok ? ((await res.json()) as Session | null) : null))
                .then((body) => (body?.user ? body : null))
                .catch(() => null),
        };
    }
    return cached.promise;
};

export const requireUser = async () => {
    const session = await getSession();
    if (!session) return redirect("/sign-in");
    return session.user;
};
