import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";
import { DeviceEventEmitter, Platform } from "react-native";

/**
 * Origin serving /api/v1. In production that is the Vercel deployment, which
 * serves the web app and the API from one domain — the same origin the website
 * calls, so every screen here talks to exactly the endpoints the web uses.
 */
export const API_BASE = (process.env.EXPO_PUBLIC_API_BASE ?? "https://tusker-managment.vercel.app").replace(/\/+$/, "");
const API_ORIGIN = new URL(API_BASE).origin;
const TOKEN_KEY = "tusker.session-token";
const LEGACY_TOKEN_KEY = "better_auth_token";
const LEGACY_SESSION_KEY = "better_auth_session";
const FETCH_TIMEOUT = 30_000;

/** Fired when the session token appears or disappears (sign-in, sign-out, 401). */
export const SESSION_EVENT = "tusker:session";

let cachedToken: string | null | undefined;

export async function getToken(): Promise<string | null> {
    if (cachedToken !== undefined) return cachedToken;
    cachedToken = (await SecureStore.getItemAsync(TOKEN_KEY).catch(() => null)) ?? (await migrateLegacyToken());
    return cachedToken;
}

/**
 * The previous app (same package, com.thewhitetusker.trava) kept its bearer
 * token in AsyncStorage. Move it into SecureStore once so an update from that
 * app doesn't sign everyone out.
 */
async function migrateLegacyToken(): Promise<string | null> {
    try {
        const token = await AsyncStorage.getItem(LEGACY_TOKEN_KEY);
        if (!token) return null;
        await SecureStore.setItemAsync(TOKEN_KEY, token);
        await AsyncStorage.multiRemove([LEGACY_TOKEN_KEY, LEGACY_SESSION_KEY]);
        return token;
    } catch {
        return null;
    }
}

export async function setToken(token: string | null) {
    cachedToken = token;
    if (token) await SecureStore.setItemAsync(TOKEN_KEY, token);
    else await SecureStore.deleteItemAsync(TOKEN_KEY).catch(() => {});
    DeviceEventEmitter.emit(SESSION_EVENT, !!token);
}

export class ApiError extends Error {
    constructor(message: string, readonly status: number, readonly code?: string, readonly body?: unknown) {
        super(message);
        this.name = "ApiError";
    }
}

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
    /** Return the raw Response instead of parsed JSON (file downloads). */
    raw?: boolean;
    signal?: AbortSignal;
};

function errorMessage(body: any, fallback: string): string {
    const err = body?.error ?? body?.message;
    if (typeof err === "string" && err) return err;
    if (err && typeof err.message === "string") return err.message;
    return fallback;
}

/**
 * Calls the API under /api/v1. Paths are written as they appear in the route
 * files (e.g. "/tasks/kanban"); the version prefix is added here only.
 */
export async function request<T = any>(path: string, options: RequestOptions = {}): Promise<T> {
    const token = await getToken();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT);
    options.signal?.addEventListener("abort", () => controller.abort());

    const url = `${API_BASE}/api/v1${path}${qs(options.query)}`;
    const hasBody = options.body !== undefined;

    try {
        const response = await fetch(url, {
            method: options.method ?? (hasBody ? "POST" : "GET"),
            signal: controller.signal,
            headers: {
                ...(hasBody ? { "Content-Type": "application/json" } : {}),
                Accept: "application/json",
                // Better Auth's CSRF check wants an Origin; native fetch sends none.
                ...(Platform.OS !== "web" ? { Origin: API_ORIGIN } : {}),
                ...(token ? { Authorization: `Bearer ${token}` } : {}),
                ...options.headers,
            },
            body: hasBody ? JSON.stringify(options.body) : undefined,
        });

        if (response.status === 401 && token && !path.startsWith("/auth/")) {
            await setToken(null);
        }

        if (options.raw) {
            if (!response.ok) throw new ApiError(`Request failed (${response.status})`, response.status);
            return response as unknown as T;
        }

        const text = await response.text();
        let body: any = {};
        if (text.trim()) {
            try {
                body = JSON.parse(text);
            } catch {
                throw new ApiError(
                    `The server answered with something other than JSON (${response.status}). Check that the API is reachable.`,
                    response.status,
                );
            }
        }

        if (!response.ok || body?.success === false) {
            throw new ApiError(errorMessage(body, `Request failed (${response.status})`), response.status, body?.code, body);
        }
        return body as T;
    } catch (error: any) {
        if (error instanceof ApiError) throw error;
        if (error?.name === "AbortError") throw new ApiError("The request timed out. Check your connection.", 0);
        throw new ApiError("Couldn't reach Tusker. Check your connection.", 0);
    } finally {
        clearTimeout(timeout);
    }
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
    del: <T = any>(path: string, body?: unknown, query?: Query) =>
        getData<T>(path, { method: "DELETE", body, query }),
};
