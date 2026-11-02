import { useSyncExternalStore } from "react";
import { QueryClient, onlineManager } from "@tanstack/react-query";
import { createAsyncStoragePersister } from "@tanstack/query-async-storage-persister";
import { del, get, set } from "idb-keyval";
import { ApiError } from "~/api/client";

/** How long saved data stays readable offline. */
export const CACHE_MAX_AGE = 7 * 24 * 60 * 60 * 1000;

/**
 * Same policy as apps/mobile/src/lib/query.ts: cached data shows instantly (also
 * across launches, via the persister) and refreshes in the background. While
 * offline, queries pause and keep showing what was saved.
 */
export const queryClient = new QueryClient({
    defaultOptions: {
        queries: {
            staleTime: 30_000,
            gcTime: CACHE_MAX_AGE, // must cover maxAge, or restored queries are dropped
            retry: (count, error) => !(error instanceof ApiError && error.status >= 400 && error.status < 500) && count < 2,
            refetchOnReconnect: true,
        },
        mutations: { retry: 0 },
    },
});

// IndexedDB, not localStorage: its ~5MB cap is too small for a week of lists.
export const persister = createAsyncStoragePersister({
    storage: {
        getItem: async (key) => (await get<string>(key)) ?? null,
        setItem: (key, value) => set(key, value),
        removeItem: (key) => del(key),
    },
    key: "tusker.query-cache",
    throttleTime: 2000,
});

/** False while the machine has no network; edit controls disable on it. */
export function useOnline() {
    return useSyncExternalStore(
        (cb) => onlineManager.subscribe(cb),
        () => onlineManager.isOnline(),
    );
}

/** Query keys, grouped so a realtime event can invalidate a whole area. Same shapes as mobile's qk. */
export const qk = {
    layout: (w: string) => ["layout", w] as const,
    workspaces: () => ["workspaces"] as const,
    tasks: (w: string, params?: unknown) => ["tasks", w, params ?? null] as const,
    reviews: (w: string) => ["reviews", w] as const,
    notifications: (w: string) => ["notifications", w] as const,
};
