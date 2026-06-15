// Shared in-flight request dedup.
//
// While a request for `key` is in flight, concurrent callers receive the SAME
// promise instead of starting a duplicate request. The entry is deleted once the
// promise settles, so a later navigation re-fetches fresh data.
//
// This neutralizes React StrictMode's dev double-invoke (and any concurrent
// re-render that re-fires an effect) deterministically — a fetch only collapses
// to one request if it is keyed through here. It also collapses genuinely
// independent callers that ask for the same resource at the same time.
//
// Reference pattern: src/hooks/use-project-tags.ts (pendingFetches map).

const inflight = new Map<string, Promise<unknown>>();

/**
 * Run `fn` deduped by `key`. Returns the in-flight promise if one already exists
 * for `key`; otherwise starts `fn()`, tracks it until it settles, and returns it.
 *
 * `key` should uniquely identify the request, including any parameters that change
 * the response (e.g. `members:${workspaceId}:${page}:${limit}:${search}`).
 */
export function dedupe<T>(key: string, fn: () => Promise<T>): Promise<T> {
    const existing = inflight.get(key) as Promise<T> | undefined;
    if (existing) return existing;

    const promise = fn().finally(() => {
        inflight.delete(key);
    });
    inflight.set(key, promise);
    return promise;
}
