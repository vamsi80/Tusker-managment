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
    const isServer = typeof window === "undefined";
    const baseUrl = isServer && process.env.NEXT_PUBLIC_APP_URL 
        ? `${process.env.NEXT_PUBLIC_APP_URL}/api/v1`
        : "/api/v1";
        
    const url = endpoint.startsWith("http") ? endpoint : `${baseUrl}${endpoint}`;

    const headers = new Headers(options.headers);
    if (!(options.body instanceof FormData)) {
        headers.set("Content-Type", "application/json");
    }

    try {
        const response = await fetch(url, {
            cache: "no-store",
            ...options,
            headers,
        });

        const data = await response.json();

        if (!response.ok) {
            const errorMsg = data.error || data.message || `API Error: ${response.status}`;
            throw new ApiError(errorMsg, response.status);
        }

        return data as T;
    } catch (error: any) {
        if (error instanceof ApiError) throw error;
        
        const message = error.message || "An unexpected error occurred";
        console.error(`[API_FETCH_ERROR] ${url}:`, error);
        throw new ApiError(message);
    }
}
