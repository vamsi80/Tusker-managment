import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { DeviceEventEmitter } from "react-native";
import { SESSION_EVENT, getToken } from "../api/client";
import { getSession, signOut as apiSignOut, type SessionUser } from "../api/auth";
import { queryClient } from "../lib/query";

type AuthState =
    | { status: "loading"; user: null }
    | { status: "signedOut"; user: null }
    | { status: "signedIn"; user: SessionUser };

type AuthContextValue = AuthState & {
    refresh: () => Promise<void>;
    signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
    const [state, setState] = useState<AuthState>({ status: "loading", user: null });

    const refresh = useCallback(async () => {
        const token = await getToken();
        if (!token) {
            setState({ status: "signedOut", user: null });
            return;
        }
        try {
            const session = await getSession();
            setState(session?.user ? { status: "signedIn", user: session.user } : { status: "signedOut", user: null });
        } catch {
            // Offline with a stored token: keep the person in, the cached data still renders.
            setState((current) =>
                current.status === "signedIn" ? current : { status: "signedIn", user: { id: "", name: "", email: "" } },
            );
            getSession()
                .then((session) => session?.user && setState({ status: "signedIn", user: session.user }))
                .catch(() => {});
        }
    }, []);

    useEffect(() => {
        refresh();
        const sub = DeviceEventEmitter.addListener(SESSION_EVENT, (hasToken: boolean) => {
            if (hasToken) refresh();
            else {
                queryClient.clear();
                setState({ status: "signedOut", user: null });
            }
        });
        return () => sub.remove();
    }, [refresh]);

    const signOut = useCallback(async () => {
        await apiSignOut();
        queryClient.clear();
        setState({ status: "signedOut", user: null });
    }, []);

    const value = useMemo(() => ({ ...state, refresh, signOut }), [state, refresh, signOut]);
    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
    const ctx = useContext(AuthContext);
    if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
    return ctx;
}
