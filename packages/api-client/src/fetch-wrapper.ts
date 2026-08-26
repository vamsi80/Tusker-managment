/**
 * Custom Error class for API failures
 */
export class ApiError extends Error {
    constructor(public message: string, public status?: number) {
        super(message);
        this.name = "ApiError";
    }
}

type AuthTokenGetter = () => string | null | undefined | Promise<string | null | undefined>;

let configuredBaseUrl: string | null = null;
let getAuthToken: AuthTokenGetter | null = null;

/**
 * Point the client at an API origin, and optionally supply a bearer token.
 *
 * The web app needs neither: it is served from the same origin as /api/v1
 * (Next proxies it) and authenticates with a cookie. A native client has no
 * same-origin context and no cookie jar, so it configures both once at startup:
 *
 *   configureApiClient({ baseUrl: "https://api.example.com", getAuthToken })
 */
export function configureApiClient(options: {
    baseUrl?: string;
    getAuthToken?: AuthTokenGetter;
}) {
    if (options.baseUrl !== undefined) {
        configuredBaseUrl = options.baseUrl.replace(/\/$/, "");
    }
    if (options.getAuthToken !== undefined) {
        getAuthToken = options.getAuthToken;
    }
}

function resolveBaseUrl(): string {
    if (configuredBaseUrl) return `${configuredBaseUrl}/api/v1`;

    const fromEnv =
        process.env.NEXT_PUBLIC_API_URL ??
        process.env.EXPO_PUBLIC_API_URL ??
        // Server-side rendering has no relative-URL context to resolve against.
        (typeof window === "undefined" ? process.env.NEXT_PUBLIC_APP_URL : undefined);

    return fromEnv ? `${fromEnv.replace(/\/$/, "")}/api/v1` : "/api/v1";
}

/**
 * Standard fetch wrapper for the Hono API
 */
export async function apiFetch<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const url = endpoint.startsWith("http") ? endpoint : `${resolveBaseUrl()}${endpoint}`;

    const headers = new Headers(options.headers);
    if (!(options.body instanceof FormData)) {
        headers.set("Content-Type", "application/json");
    }

    if (getAuthToken && !headers.has("Authorization")) {
        const token = await getAuthToken();
        if (token) headers.set("Authorization", `Bearer ${token}`);
    }

    try {
        const response = await fetch(url, {
            cache: "no-store",
            ...options,
            headers,
        });

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

        const message = error.message || "An unexpected error occurred";
        console.error(`[API_FETCH_ERROR] ${url}:`, error);
        throw new ApiError(message);
    }
}
