import { cookies } from "next/headers";

const getBaseUrl = () => {
    const host = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8787";
    return `${host}/api/v1`;
};

export async function serverApiFetch<T>(endpoint: string, options?: RequestInit): Promise<T> {
    const cookieStore = await cookies();
    const cookieHeader = cookieStore.toString();

    const url = `${getBaseUrl()}${endpoint}`;

    const response = await fetch(url, {
        ...options,
        headers: {
            "Content-Type": "application/json",
            Cookie: cookieHeader,
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
