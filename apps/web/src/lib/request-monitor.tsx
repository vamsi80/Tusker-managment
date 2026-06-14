"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";

/**
 * Dev request monitor — prints, per route navigation, how many network requests fired
 * and a breakdown by endpoint, directly to the browser console.
 *
 * Enabled automatically in development. To enable on a deployed (production) build,
 * run in the browser console once:  localStorage.setItem("rq_debug", "1")  then reload.
 * (Disable with localStorage.removeItem("rq_debug").)
 */

type Hit = { path: string; method: string };

let patched = false;
let hits: Hit[] = [];

function isEnabled(): boolean {
    if (typeof window === "undefined") return false;
    if (process.env.NODE_ENV !== "production") return true;
    try {
        return window.localStorage.getItem("rq_debug") === "1";
    } catch {
        return false;
    }
}

function normalize(rawUrl: string): string | null {
    try {
        const u = new URL(rawUrl, window.location.origin);
        let p = u.pathname;
        // Ignore static assets / Next internals — we only care about data requests.
        if (/\/_next\/|\.(js|mjs|css|png|jpe?g|svg|gif|webp|woff2?|ttf|ico|map|json)$/i.test(p)) return null;
        // Collapse ids so routes group cleanly.
        p = p.replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, ":id");
        return p;
    } catch {
        return null;
    }
}

function patchFetch() {
    if (patched || typeof window === "undefined") return;
    patched = true;
    const orig = window.fetch.bind(window);
    window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
        try {
            const url =
                typeof input === "string" ? input : input instanceof URL ? input.href : (input as Request).url;
            const method = (init?.method || (input instanceof Request ? input.method : "GET")).toUpperCase();
            const path = normalize(url);
            if (path) hits.push({ path, method });
        } catch {
            /* ignore */
        }
        return orig(input as RequestInfo | URL, init);
    };
}

export function RequestMonitor() {
    const pathname = usePathname();
    const announced = useRef(false);

    useEffect(() => {
        if (!isEnabled()) return;
        patchFetch();

        if (!announced.current) {
            announced.current = true;
            // eslint-disable-next-line no-console
            console.log("%c📊 Request monitor ON — per-route request counts will print here.", "color:#8b0000;font-weight:bold");
        }

        const start = hits.length;
        const route = pathname;

        // Capture the burst of requests fired in the ~2s after landing on this route.
        const timer = setTimeout(() => {
            const fired = hits.slice(start);
            const apiCount = fired.filter((h) => h.path.startsWith("/api/")).length;

            const groups = new Map<string, number>();
            for (const h of fired) {
                const key = `${h.method} ${h.path}`;
                groups.set(key, (groups.get(key) || 0) + 1);
            }
            const rows = [...groups.entries()]
                .map(([request, count]) => ({ request, count }))
                .sort((a, b) => b.count - a.count);

            // eslint-disable-next-line no-console
            console.groupCollapsed(`📊 ${route} → ${fired.length} requests (${apiCount} API) in 2s`);
            // eslint-disable-next-line no-console
            console.table(rows);
            // eslint-disable-next-line no-console
            console.groupEnd();

            // Keep the buffer bounded.
            if (hits.length > 2000) hits = hits.slice(-500);
        }, 2000);

        return () => clearTimeout(timer);
    }, [pathname]);

    return null;
}
