import { toast } from "sonner";

/**
 * Custom Error class for API failures
 */
export class ApiError extends Error {
    constructor(public message: string, public status?: number) {
        super(message);
        this.name = "ApiError";
    }
}

// Transient HTTP statuses worth a bounded retry (gateway/availability, not app errors).
const RETRYABLE_STATUS = new Set([502, 503, 504]);
const MAX_RETRIES = 2;

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Standard fetch wrapper for the Hono API.
 *
 * Retries are deliberately conservative to avoid request storms: only idempotent reads
 * (GET/HEAD), only on transport failures or 502/503/504, never on 4xx/401, capped at
 * MAX_RETRIES with jittered exponential backoff.
 */
export async function apiFetch<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    // Always same-origin (relative) so the first-party session cookie is sent.
    // Next.js rewrites /api/v1/* to the worker and forwards the Cookie header.
    // Calling the worker's absolute URL would be cross-origin → the web-domain
    // session cookie is NOT included → 401 Unauthorized.
    const url = endpoint.startsWith("http") ? endpoint : `/api/v1${endpoint}`;

    const headers = new Headers(options.headers);
    if (!(options.body instanceof FormData)) {
        headers.set("Content-Type", "application/json");
    }

    const method = (options.method ?? "GET").toUpperCase();
    const isIdempotent = method === "GET" || method === "HEAD";

    const attempt = async (): Promise<T> => {
        try {
            const fetchStart = Date.now(); // PERF_TEMP
            const response = await fetch(url, {
                cache: "no-store",
                credentials: "include",
                ...options,
                headers,
            });
            const fetchMs = Date.now() - fetchStart; // PERF_TEMP
            if (fetchMs > 500 && process.env.NODE_ENV === "development") console.warn(`[SLOW_FETCH] ${method} ${endpoint} ${fetchMs}ms`); // PERF_TEMP

            const contentType = response.headers.get("content-type");
            const isJson = contentType && contentType.includes("application/json");

            if (!isJson) {
                const text = await response.text();
                console.error(`[apiFetch] Expected JSON but got ${contentType}. Status: ${response.status}. Body: ${text.substring(0, 200)}`);
                throw new ApiError(`Server returned non-JSON response (${response.status})`, response.status);
            }

            const data = await response.json();

            if (!response.ok) {
                const errorMsg = data.error || data.message || `API Error: ${response.status}`;
                throw new ApiError(errorMsg, response.status);
            }

            return data as T;
        } catch (error: unknown) {
            if (error instanceof ApiError) throw error;

            const rawMessage: string = error instanceof Error ? error.message : "An unexpected error occurred";
            console.error(`[API_FETCH_ERROR] ${url}:`, error);

            // Surface a friendly message for DB/network timeouts instead of raw pg errors
            const isTimeout = rawMessage.toLowerCase().includes("timeout") || rawMessage.toLowerCase().includes("econnrefused") || rawMessage.toLowerCase().includes("etimedout");
            const message = isTimeout
                ? "Request timed out — the server is warming up, please try again in a moment."
                : rawMessage;

            // Transport failure (no HTTP status) — status-less ApiError marks it retryable for reads.
            throw new ApiError(message);
        }
    };

    let lastError: ApiError = new ApiError("Request failed");
    for (let i = 0; i <= MAX_RETRIES; i++) {
        try {
            return await attempt();
        } catch (error) {
            const apiError = error instanceof ApiError ? error : new ApiError(String(error));
            lastError = apiError;

            const isRetryable = apiError.status === undefined || RETRYABLE_STATUS.has(apiError.status);
            if (!isIdempotent || !isRetryable || i === MAX_RETRIES) {
                throw apiError;
            }

            // Jittered exponential backoff: ~300–600ms, then ~600–900ms.
            await sleep(300 * 2 ** i + Math.random() * 300);
        }
    }
    throw lastError;
}
