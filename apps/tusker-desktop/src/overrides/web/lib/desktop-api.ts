/**
 * Shared by the desktop overrides of the website's server actions and data
 * loaders: calls /api/v1 through the fetch bridge and turns failures into the
 * { success: false, error } results those server actions return.
 */
import { apiFetch } from "@tusker/api-client";

export type ActionResult<T = undefined> = { success: true; data: T; error?: undefined } | { success: false; error: string; data?: T };

/** GET/POST/... and unwrap the API's { success, data } body. */
export async function api<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
    const res = await apiFetch<{ data?: T } & Record<string, unknown>>(path, {
        method: init.method ?? (init.body !== undefined ? "POST" : "GET"),
        body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
    });
    return (res && "data" in res ? res.data : res) as T;
}

/** Runs a call the way a server action reports it: never throws, returns { success, error }. */
export async function action<T>(run: () => Promise<T>, fallback: string): Promise<ActionResult<T>> {
    try {
        return { success: true, data: await run() };
    } catch (error) {
        return { success: false, error: error instanceof Error && error.message ? error.message : fallback };
    }
}
