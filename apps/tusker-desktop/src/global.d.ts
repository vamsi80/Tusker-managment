/** Exposed by electron/preload.cjs: the page's only way to the network or the OS. */
interface Window {
    tusker: {
        request(
            path: string,
            opts: { method?: string; body?: unknown; headers?: Record<string, string> },
        ): Promise<{ ok: boolean; status: number; text: string; error?: string }>;
        session(): Promise<{ signedIn: boolean; base: string }>;
        signIn(email: string, password: string): Promise<{ ok: boolean; error?: string }>;
        signOut(): Promise<void>;
        notify(title: string, body?: string): Promise<void>;
        open(url: string): Promise<void>;
        /** Fires when the main process gains or drops the token (sign-in, sign-out, 401). */
        onSession(cb: (signedIn: boolean) => void): () => void;
    };
}

interface ImportMetaEnv {
    readonly VITE_PUSHER_KEY?: string;
    readonly VITE_PUSHER_CLUSTER?: string;
}
