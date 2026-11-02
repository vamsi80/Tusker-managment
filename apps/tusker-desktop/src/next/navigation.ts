/**
 * next/navigation for the website's components running in the desktop app.
 * Routes keep the website's paths (/w/:workspaceId/...), so a component's
 * router.push("/w/123/calendar") lands on the same page here. Covers what
 * apps/web uses: useRouter, usePathname, useSearchParams, useParams, redirect,
 * notFound.
 */
import { useMemo } from "react";
import { useLocation, useNavigate, useParams as useRouteParams } from "react-router";

/** Server pages re-ran on refresh; here, pages listen for this and reload their data. */
export const REFRESH_EVENT = "tusker:refresh";

const toPath = (href: string | URL) => {
    const s = String(href);
    // Absolute links to the website itself become in-app paths.
    try {
        const u = new URL(s);
        if (/^https?:$/.test(u.protocol) && !u.pathname.startsWith("/w")) return null;
        return u.pathname + u.search + u.hash;
    } catch {
        return s;
    }
};

export function useRouter() {
    const navigate = useNavigate();
    return useMemo(
        () => ({
            push: (href: string, _opts?: unknown) => {
                const path = toPath(href);
                if (path == null) window.tusker.open(String(href));
                else navigate(path);
            },
            replace: (href: string, _opts?: unknown) => {
                const path = toPath(href);
                if (path == null) window.tusker.open(String(href));
                else navigate(path, { replace: true });
            },
            back: () => navigate(-1),
            forward: () => navigate(1),
            refresh: () => window.dispatchEvent(new Event(REFRESH_EVENT)),
            prefetch: (_href: string) => {},
        }),
        [navigate],
    );
}

export function usePathname() {
    return useLocation().pathname;
}

export function useSearchParams() {
    const { search } = useLocation();
    return useMemo(() => new URLSearchParams(search) as URLSearchParams & { readonly size: number }, [search]);
}

export function useParams<T extends Record<string, string | string[]> = Record<string, string>>() {
    return useRouteParams() as unknown as T;
}

/** Used by server pages for "go elsewhere"; here it moves the hash route. */
export function redirect(href: string): never {
    const path = toPath(href) ?? "/";
    window.location.hash = `#${path}`;
    throw new Error(`NEXT_REDIRECT ${path}`);
}

export function notFound(): never {
    throw new Error("NEXT_NOT_FOUND");
}

export const RedirectType = { push: "push", replace: "replace" } as const;
