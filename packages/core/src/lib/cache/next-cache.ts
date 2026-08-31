/**
 * Next.js cache primitives, guarded so this package also runs outside Next.
 *
 * `@tusker/core` is shared by the Next web app and by plain Node processes
 * (the standalone API, vitest). Importing "next/cache" from those runtimes
 * either fails to resolve or throws for want of a request context, so every
 * call is wrapped: inside Next it behaves exactly as before, and everywhere
 * else it degrades to a no-op — correct, since a process that renders nothing
 * owns no render cache to invalidate.
 */

type NextCacheModule = {
    revalidateTag?: (tag: string, type?: unknown) => void;
    revalidatePath?: (path: string, type?: unknown) => void;
    updateTag?: (tag: string) => void;
    unstable_cache?: <T>(fn: T, keys?: string[], opts?: unknown) => T;
};

async function loadNextCache(): Promise<NextCacheModule | null> {
    try {
        // The specifier stays a literal so Next's bundler still resolves it for
        // the web app; the ignore is because this package deliberately does not
        // depend on `next`, so there are no types for it here.
        // @ts-ignore -- optional peer, absent outside the Next runtime
        return (await import("next/cache")) as NextCacheModule;
    } catch {
        return null;
    }
}

export async function revalidateTag(tag: string, type?: unknown): Promise<void> {
    const mod = await loadNextCache();
    try {
        mod?.revalidateTag?.(tag, type);
    } catch {
        // outside a Next render/request scope — nothing to invalidate
    }
}

export async function revalidatePath(path: string, type?: unknown): Promise<void> {
    const mod = await loadNextCache();
    try {
        mod?.revalidatePath?.(path, type);
    } catch {
        // see above
    }
}

export async function updateTag(tag: string): Promise<void> {
    const mod = await loadNextCache();
    try {
        mod?.updateTag?.(tag);
    } catch {
        // see above
    }
}

/**
 * Wraps `unstable_cache`. Without a Next runtime the function is returned
 * as-is, so the work still happens — just uncached.
 */
export async function unstableCache<T extends (...args: never[]) => Promise<unknown>>(
    fn: T,
    keys?: string[],
    opts?: unknown
): Promise<T> {
    const mod = await loadNextCache();
    if (!mod?.unstable_cache) return fn;

    let cached: T;
    try {
        cached = mod.unstable_cache(fn, keys, opts);
    } catch {
        return fn;
    }

    // Resolving "next/cache" is not the same as running inside Next. The web
    // app is in this workspace, so the import succeeds for the standalone API
    // too and wrapping never throws — the invariant fires only when the cached
    // function is *called*, past the try above. Guard the call as well, and run
    // uncached. Safe to retry: unstable_cache checks for the incremental cache
    // before invoking fn, so the original has not run when this throws.
    return (async (...args: never[]) => {
        try {
            return await cached(...args);
        } catch (err) {
            if (err instanceof Error && err.message.includes("incrementalCache")) {
                return await fn(...args);
            }
            throw err;
        }
    }) as T;
}
