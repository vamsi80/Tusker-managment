/**
 * Lets the website's own code (its API client, Better Auth's client, plain
 * fetch("/api/v1/...")) run unchanged in the desktop window. Those requests go
 * through the main process, which holds the session token: no CORS, and the
 * page never sees the token. Everything else (Pusher, file storage) is untouched.
 *
 * Offline reading: successful GET responses are saved in IndexedDB and served
 * when the network is down, so every page shows its last data offline. Cleared
 * on sign-out (clearApiCache).
 */
import { clear, createStore, get, set } from "idb-keyval";

const WEBSITE_ORIGIN = "https://tusker-managment.vercel.app";
const cache = createStore("tusker-api-cache", "responses");

/** The /api/v1 path a request maps to, or null when it isn't an API call. */
function apiPath(input: RequestInfo | URL): string | null {
    const raw = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    let url: URL;
    try {
        url = new URL(raw, WEBSITE_ORIGIN);
    } catch {
        return null;
    }
    const sameSite = url.origin === WEBSITE_ORIGIN || url.protocol === "file:" || raw.startsWith("/");
    if (!sameSite) return null;
    if (url.pathname.startsWith("/api/v1/")) return url.pathname + url.search;
    // Better Auth's client calls the website's /api/auth/*; the API serves the same under /api/v1/auth/*.
    if (url.pathname.startsWith("/api/auth/")) return `/api/v1/auth/${url.pathname.slice("/api/auth/".length)}${url.search}`;
    return null;
}

function headersToObject(headers: HeadersInit | undefined): Record<string, string> {
    const out: Record<string, string> = {};
    new Headers(headers).forEach((value, key) => {
        // The main process sets these itself.
        if (!["authorization", "cookie", "origin", "content-length"].includes(key)) out[key] = value;
    });
    return out;
}

async function bodyToString(body: BodyInit | null | undefined): Promise<string | undefined> {
    if (body == null) return undefined;
    if (typeof body === "string") return body;
    if (body instanceof URLSearchParams) return body.toString();
    if (body instanceof Blob) return body.text();
    if (body instanceof FormData) throw new TypeError("File uploads through the API aren't supported in the desktop app yet.");
    return new Response(body).text();
}

const json = (status: number, body: unknown, extra: Record<string, string> = {}) =>
    new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...extra } });

export function installFetchBridge() {
    const nativeFetch = window.fetch.bind(window);

    window.fetch = async (input: RequestInfo | URL, init: RequestInit = {}) => {
        const path = apiPath(input);
        if (!path) return nativeFetch(input, init);

        const request = input instanceof Request ? input : null;
        const method = (init.method ?? request?.method ?? "GET").toUpperCase();
        const body = await bodyToString(init.body ?? (request && method !== "GET" ? await request.text() : undefined));
        const res = await window.tusker.request(path, {
            method,
            body,
            headers: headersToObject(init.headers ?? request?.headers),
        });

        if (res.status === 0) {
            // Offline (or the server is unreachable): fall back to the last saved copy.
            const saved = method === "GET" ? await get<{ text: string; contentType: string }>(path, cache).catch(() => undefined) : undefined;
            if (saved) return new Response(saved.text, { status: 200, headers: { "content-type": saved.contentType, "x-tusker-offline": "1" } });
            return json(503, { success: false, error: "You're offline, and this hasn't been opened before." });
        }

        const contentType = res.contentType || "application/json";
        if (method === "GET" && res.ok) set(path, { text: res.text, contentType }, cache).catch(() => {});
        return new Response(res.text, {
            status: res.status,
            headers: { "content-type": contentType, ...(res.authToken ? { "set-auth-token": res.authToken } : {}) },
        });
    };
}

export const clearApiCache = () => clear(cache).catch(() => {});
