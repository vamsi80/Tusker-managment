import { cookies } from "next/headers";
import { getApiBaseUrl } from "./base-url";

export async function serverApiFetch<T>(endpoint: string, options?: RequestInit): Promise<T> {
    const cookieStore = await cookies();
    const cookieHeader = cookieStore.toString();

    const url = `${getApiBaseUrl()}${endpoint}`;
    console.log(`[serverApiFetch] URL: ${url}`);

    let authHeader: Record<string, string> = {};
    try {
        const { getSession } = await import("@/lib/auth/require-user");
        const session = await getSession();
        const token = session?.session?.token;
        if (token) {
            authHeader = { Authorization: `Bearer ${token}` };
        }
    } catch (e) {
        console.warn("[serverApiFetch] Failed to resolve session token for Bearer auth:", e);
    }

    const response = await fetch(url, {
        ...options,
        headers: {
            "Content-Type": "application/json",
            Cookie: cookieHeader,
            ...authHeader,
            ...options?.headers,
        },
        cache: "no-store",
    });

    const data = await response.json();

    if (!response.ok) {
        throw new Error(data.error || data.message || `API Error: ${response.status}`);
    }

    return data as T;
}
