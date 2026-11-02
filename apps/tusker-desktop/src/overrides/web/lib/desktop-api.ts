/**
 * Shared by the desktop overrides of the website's server actions, data loaders
 * and core services: calls /api/v1 through the fetch bridge.
 *
 * On the website these values reach components through React's server→client
 * transport, which keeps Date objects as Dates. JSON turns them into ISO
 * strings, so timestamps are revived here to give components what they get on
 * the website.
 */
export type ActionResult<T = undefined> = { success: true; data: T; error?: undefined; message?: string } | { success: false; error: string; data?: T };

const ISO_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;
const reviveDates = (_key: string, value: unknown) => (typeof value === "string" && ISO_TIMESTAMP.test(value) ? new Date(value) : value);

export class DesktopApiError extends Error {
    constructor(message: string, readonly status: number) {
        super(message);
        this.name = "DesktopApiError";
    }
}

type Query = Record<string, string | number | boolean | null | undefined | string[]>;

function withQuery(path: string, query?: Query) {
    if (!query) return path;
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(query)) {
        if (value === undefined || value === null || value === "") continue;
        if (Array.isArray(value)) value.forEach((v) => params.append(key, v));
        else params.append(key, String(value));
    }
    const qs = params.toString();
    return qs ? `${path}${path.includes("?") ? "&" : "?"}${qs}` : path;
}

/** The full JSON body of an /api/v1 call; throws DesktopApiError on failure. */
export async function apiBody<T = any>(
    path: string,
    init: { method?: string; body?: unknown; query?: Query; headers?: Record<string, string> } = {},
): Promise<T> {
    const res = await fetch(`/api/v1${withQuery(path, init.query)}`, {
        method: init.method ?? (init.body !== undefined ? "POST" : "GET"),
        headers: { "content-type": "application/json", ...init.headers },
        body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
    });
    const text = await res.text();
    const body = text ? JSON.parse(text, reviveDates) : null;
    if (!res.ok || body?.success === false) {
        const message = body?.error?.message ?? body?.error ?? body?.message ?? `Request failed (${res.status})`;
        throw new DesktopApiError(String(message), res.status);
    }
    return body as T;
}

/** Like apiBody, unwrapping the API's { success, data } envelope. */
export async function api<T = any>(path: string, init: Parameters<typeof apiBody>[1] = {}): Promise<T> {
    const body = await apiBody<{ data?: T }>(path, init);
    return (body && typeof body === "object" && "data" in body ? body.data : body) as T;
}

/** Runs a call the way a server action reports it: never throws, returns { success, error }. */
export async function action<T>(run: () => Promise<T>, fallback: string): Promise<ActionResult<T>> {
    try {
        return { success: true, data: await run() };
    } catch (error) {
        return { success: false, error: error instanceof Error && error.message ? error.message : fallback };
    }
}

/** Server actions whose API route already answers in the action's own shape ({ success, data, message }). */
export async function passthrough<T = any>(path: string, init: Parameters<typeof apiBody>[1], fallback: string): Promise<T> {
    try {
        return await apiBody<T>(path, init);
    } catch (error) {
        return { success: false, error: error instanceof Error && error.message ? error.message : fallback } as T;
    }
}
