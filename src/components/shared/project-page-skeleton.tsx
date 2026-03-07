import { Skeleton } from "@/components/ui/skeleton";

/**
 * ProjectPageSkeleton — Single source of truth for all project loading states.
 *
 * Used by:
 *  - loading.tsx         (instant navigation skeleton)
 *  - page.tsx Suspense fallbacks (per-view streaming skeleton)
 *  - ReloadableView fallback (after taskTableReload event)
 *
 * Fully responsive: collapses gracefully on mobile.
 */
export function ProjectPageSkeleton() {
    return (
        <div className="flex flex-col gap-4 sm:gap-6 pb-3 px-2 sm:px-3 h-full w-full overflow-hidden">
            {/* ── Header ──────────────────────────────────────────── */}
            <div className="flex items-start sm:items-center justify-between gap-3 pt-1">
                <div className="space-y-1.5 min-w-0">
                    <Skeleton className="h-7 sm:h-9 w-40 sm:w-56" />
                    <Skeleton className="h-3 w-28 sm:w-40" />
                </div>
                {/* Action buttons — 2 on mobile, 3 on desktop */}
                <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
                    <Skeleton className="h-8 sm:h-9 w-8 sm:w-9 rounded-md" />
                    <Skeleton className="hidden sm:block h-9 w-28 rounded-md" />
                    <Skeleton className="h-8 sm:h-9 w-20 sm:w-28 rounded-md" />
                </div>
            </div>

            {/* ── Nav tabs ────────────────────────────────────────── */}
            <div className="border-b border-neutral-200 dark:border-neutral-700">
                <div className="flex h-9 sm:h-10 items-end gap-1 overflow-hidden">
                    <Skeleton className="h-7 sm:h-8 w-20 sm:w-24 rounded-t-md rounded-b-none shrink-0" />
                    <Skeleton className="h-6 sm:h-7 w-12 sm:w-16 rounded-t-md rounded-b-none shrink-0" />
                    <Skeleton className="h-6 sm:h-7 w-16 sm:w-20 rounded-t-md rounded-b-none shrink-0" />
                    <Skeleton className="h-6 sm:h-7 w-12 sm:w-16 rounded-t-md rounded-b-none shrink-0" />
                </div>
            </div>

            {/* ── Content area ────────────────────────────────────── */}
            <div className="flex-1 space-y-2 sm:space-y-2.5 overflow-hidden">
                {/* Toolbar row */}
                <div className="flex items-center gap-2 flex-wrap">
                    <Skeleton className="h-8 w-24 sm:w-32 rounded-md" />
                    <Skeleton className="h-8 w-20 sm:w-24 rounded-md" />
                    <div className="ml-auto flex gap-1.5 sm:gap-2">
                        <Skeleton className="h-8 w-16 sm:w-20 rounded-md" />
                        <Skeleton className="h-8 w-16 sm:w-20 rounded-md" />
                    </div>
                </div>

                {/* Table header row */}
                <div className="flex items-center gap-3 sm:gap-4 px-3 py-2 border rounded-md
                               border-neutral-200 dark:border-neutral-700
                               bg-neutral-50 dark:bg-neutral-800/50">
                    <Skeleton className="h-3.5 w-6 shrink-0" />
                    <Skeleton className="h-3.5 flex-1 max-w-[160px] sm:max-w-[200px]" />
                    <div className="ml-auto hidden sm:flex items-center gap-4">
                        <Skeleton className="h-3.5 w-16" />
                        <Skeleton className="h-3.5 w-16" />
                        <Skeleton className="h-3.5 w-16" />
                    </div>
                </div>

                {/* Task rows — fewer on mobile to avoid overflow */}
                {Array.from({ length: 6 }).map((_, i) => (
                    <div
                        key={i}
                        className="flex items-center gap-2 sm:gap-4 px-3 py-2 sm:py-2.5 border rounded-md
                                   border-neutral-200 dark:border-neutral-700 overflow-hidden"
                        style={{ opacity: Math.max(0.25, 1 - i * 0.13) }}
                    >
                        {/* Checkbox */}
                        <Skeleton className="h-4 w-4 rounded-sm shrink-0" />
                        {/* Task name */}
                        <Skeleton className={`h-3.5 shrink-0 ${i % 3 === 0 ? "w-40 sm:w-64" :
                                i % 3 === 1 ? "w-32 sm:w-48" :
                                    "w-36 sm:w-56"
                            }`} />
                        {/* Right-side meta — hide on xs */}
                        <div className="ml-auto hidden sm:flex items-center gap-3 shrink-0">
                            <Skeleton className="h-5 w-14 rounded-full" />
                            <Skeleton className="h-6 w-6 rounded-full" />
                            <Skeleton className="h-3.5 w-18" />
                        </div>
                        {/* Mobile: just status pill */}
                        <div className="ml-auto flex sm:hidden shrink-0">
                            <Skeleton className="h-5 w-14 rounded-full" />
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
