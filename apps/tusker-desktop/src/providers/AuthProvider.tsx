import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { ApiError, request } from "~/api/client";
import { clearApiCache } from "~/next/fetch-bridge";

export type SessionUser = { id: string; name: string; surname?: string | null; email: string; image?: string | null };

type AuthState = { status: "loading" } | { status: "signedOut" } | { status: "signedIn"; user: SessionUser };
type AuthContextValue = AuthState & {
    signIn: (email: string, password: string) => Promise<void>;
    signOut: () => Promise<void>;
};

// The signed-in user is saved so the app opens offline with its cached data.
// Not a secret: the token itself stays encrypted in the main process.
const USER_KEY = "tusker.user";

function savedUser(): SessionUser | null {
    try {
        return JSON.parse(localStorage.getItem(USER_KEY) ?? "null");
    } catch {
        return null;
    }
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
    const [state, setState] = useState<AuthState>({ status: "loading" });

    // Everything cached belonged to the person signing out: drop it, so the next
    // sign-in on this PC never sees their data.
    const clearSession = useCallback(async () => {
        setState({ status: "signedOut" });
        localStorage.removeItem(USER_KEY);
        await clearApiCache();
    }, []);

    const load = useCallback(async () => {
        const { signedIn } = await window.tusker.session();
        if (!signedIn) return setState({ status: "signedOut" });
        try {
            const body = await request<{ user?: SessionUser } | null>("/auth/get-session");
            if (!body?.user) return clearSession();
            localStorage.setItem(USER_KEY, JSON.stringify(body.user));
            setState({ status: "signedIn", user: body.user });
        } catch (error) {
            if (error instanceof ApiError && error.status === 401) return clearSession();
            // Offline (or the server hiccuped): carry on with the saved user and cache.
            const user = savedUser();
            setState(user ? { status: "signedIn", user } : { status: "signedOut" });
        }
    }, [clearSession]);

    useEffect(() => {
        load();
        // The main process drops the token on any 401: the session ended elsewhere.
        return window.tusker.onSession((signedIn) => {
            if (!signedIn) clearSession();
        });
    }, [load, clearSession]);

    const signIn = useCallback(
        async (email: string, password: string) => {
            const result = await window.tusker.signIn(email, password);
            if (!result.ok) throw new Error(result.error ?? "Couldn't sign in.");
            await load();
        },
        [load],
    );

    const signOut = useCallback(async () => {
        await window.tusker.signOut();
        await clearSession();
    }, [clearSession]);

    return <AuthContext.Provider value={{ ...state, signIn, signOut }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
    const ctx = useContext(AuthContext);
    if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
    return ctx;
}

/** For screens under the signed-in gate. */
export function useUser(): SessionUser {
    const auth = useAuth();
    if (auth.status !== "signedIn") throw new Error("useUser needs a signed-in session");
    return auth.user;
}
