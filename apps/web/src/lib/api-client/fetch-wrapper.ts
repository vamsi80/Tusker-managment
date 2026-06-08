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

/**
 * Standard fetch wrapper for the Hono API
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

    try {
        const fetchStart = Date.now(); // PERF_TEMP
        const response = await fetch(url, {
            cache: "no-store",
            credentials: "include",
            ...options,
            headers,
        });
        const fetchMs = Date.now() - fetchStart; // PERF_TEMP
        if (fetchMs > 500 && process.env.NODE_ENV === "development") console.warn(`[SLOW_FETCH] ${options.method ?? "GET"} ${endpoint} ${fetchMs}ms`); // PERF_TEMP

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
    } catch (error: any) {
        if (error instanceof ApiError) throw error;
        
        const rawMessage: string = error.message || "An unexpected error occurred";
        console.error(`[API_FETCH_ERROR] ${url}:`, error);

        // Surface a friendly message for DB/network timeouts instead of raw pg errors
        const isTimeout = rawMessage.toLowerCase().includes("timeout") || rawMessage.toLowerCase().includes("econnrefused") || rawMessage.toLowerCase().includes("etimedout");
        const message = isTimeout
            ? "Request timed out — the server is warming up, please try again in a moment."
            : rawMessage;

        throw new ApiError(message);
    }
}
