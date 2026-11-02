/**
 * The same exports as apps/mobile/src/api/client.ts (api, request, getData, qs,
 * ApiError), so the mobile app's endpoint modules run here unchanged (see the
 * resolver in vite.config.ts). The difference is transport: requests go through
 * the main process, which holds the token and attaches it; the page never sees it.
 */

type Query = Record<string, string | number | boolean | null | undefined | (string | number)[]>;

/** Builds a query string. Arrays become repeated keys, which every list route reads with queries(). */
export function qs(query?: Query): string {
    if (!query) return "";
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(query)) {
        if (value === undefined || value === null || value === "") continue;
        if (Array.isArray(value)) value.forEach((v) => params.append(key, String(v)));
        else params.append(key, String(value));
    }
    const s = params.toString();
    return s ? `?${s}` : "";
}

export type RequestOptions = {
    method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
    body?: unknown;
    query?: Query;
    headers?: Record<string, string>;
    /** File downloads: not supported over IPC yet; such calls reject. */
    raw?: boolean;
    signal?: AbortSignal;
};

export class ApiError extends Error {
    constructor(message: string, readonly status: number, readonly code?: string, readonly body?: unknown) {
        super(message);
        this.name = "ApiError";
    }
}

function errorMessage(body: any, fallback: string): string {
    const err = body?.error ?? body?.message;
    if (typeof err === "string" && err) return err;
    if (err && typeof err.message === "string") return err.message;
    return fallback;
}

/** Calls /api/v1. Paths are written as in the route files ("/tasks"); the prefix is added here. */
export async function request<T = any>(path: string, options: RequestOptions = {}): Promise<T> {
    if (options.raw) throw new ApiError("Downloads aren't available in the desktop app yet.", 0);
    const hasBody = options.body !== undefined;
    const res = await window.tusker.request(`/api/v1${path}${qs(options.query)}`, {
        method: options.method ?? (hasBody ? "POST" : "GET"),
        body: options.body,
        headers: options.headers,
    });
    if (res.status === 0) throw new ApiError("Couldn't reach Tusker. Check your connection.", 0);

    let body: any = {};
    if (res.text.trim()) {
        try {
            body = JSON.parse(res.text);
        } catch {
            throw new ApiError(`The server answered with something other than JSON (${res.status}).`, res.status);
        }
    }
    if (!res.ok || body?.success === false) {
        throw new ApiError(errorMessage(body, `Request failed (${res.status})`), res.status, body?.code, body);
    }
    return body as T;
}

/** Most routes answer { success, data }. */
export async function getData<T = any>(path: string, options: RequestOptions = {}): Promise<T> {
    const body = await request<{ data: T }>(path, options);
    return body.data;
}

export const api = {
    get: <T = any>(path: string, query?: Query, headers?: Record<string, string>) => getData<T>(path, { query, headers }),
    post: <T = any>(path: string, body?: unknown, query?: Query) => getData<T>(path, { method: "POST", body: body ?? {}, query }),
    patch: <T = any>(path: string, body?: unknown, query?: Query) => getData<T>(path, { method: "PATCH", body: body ?? {}, query }),
    put: <T = any>(path: string, body?: unknown, query?: Query) => getData<T>(path, { method: "PUT", body: body ?? {}, query }),
    del: <T = any>(path: string, body?: unknown, query?: Query) => getData<T>(path, { method: "DELETE", body, query }),
};
