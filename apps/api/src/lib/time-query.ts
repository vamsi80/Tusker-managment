// PERF_TEMP: wrap Prisma queries to log duration — delete this file before shipping

/**
 * Wraps a Prisma (or any async) query with console timing.
 * Logs [DB_TIMING] for normal queries and [SLOW_QUERY] for queries >700 ms.
 * Does not log query text, parameters, or any user data.
 */
export async function timeQuery<T>(label: string, fn: () => Promise<T>): Promise<T> {
    const start = performance.now();
    try {
        const result = await fn();
        const ms = Math.round(performance.now() - start);
        if (ms > 700) {
            console.warn(`[SLOW_QUERY] ${label} ${ms}ms`);
        } else {
            console.log(`[DB_TIMING] ${label} ${ms}ms`);
        }
        return result;
    } catch (err) {
        const ms = Math.round(performance.now() - start);
        console.error(`[DB_ERROR] ${label} failed after ${ms}ms`);
        throw err;
    }
}
