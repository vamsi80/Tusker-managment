import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

/**
 * WorkspaceTasksSkeleton — single responsive skeleton for the /tasks route.
 * Used by loading.tsx (instant) and Suspense fallbacks in page.tsx.
 */
export function WorkspaceTasksSkeleton() {
    return (
        <div className="flex flex-col gap-0 pb-3 px-0 h-full w-full overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between gap-3">
                <Skeleton className="h-7 sm:h-9 w-36 sm:w-52" />
                <div className="flex items-center gap-1.5 sm:gap-2">
                    <Skeleton className="h-8 sm:h-9 w-20 sm:w-28 rounded-md" />
                    <Skeleton className="h-8 sm:h-9 w-20 sm:w-28 rounded-md" />
                </div>
            </div>

            {/* View tabs */}
            <div className="border-b border-neutral-200 dark:border-neutral-700">
                <div className="flex h-9 sm:h-10 items-end gap-1">
                    <Skeleton className="h-7 sm:h-8 w-14 sm:w-16 rounded-t-md rounded-b-none shrink-0" />
                    <Skeleton className="h-6 sm:h-7 w-18 sm:w-20 rounded-t-md rounded-b-none shrink-0" />
                    <Skeleton className="h-6 sm:h-7 w-12 sm:w-16 rounded-t-md rounded-b-none shrink-0" />
                </div>
            </div>

            {/* Toolbar */}
            <div className="flex items-center gap-2 flex-wrap">
                <Skeleton className="h-8 w-full sm:w-72 rounded-md" />
                <Skeleton className="h-8 w-20 sm:w-24 rounded-md" />
                <div className="ml-auto flex gap-1.5">
                    <Skeleton className="h-8 w-16 sm:w-20 rounded-md" />
                    <Skeleton className="h-8 w-16 sm:w-20 rounded-md" />
                </div>
            </div>

            {/* Table header */}
            <div className="flex items-center gap-3 sm:gap-4 px-3 py-2 border rounded-md
                           border-neutral-200 dark:border-neutral-700
                           bg-neutral-50 dark:bg-neutral-800/50">
                <Skeleton className="h-3.5 w-6 shrink-0" />
                <Skeleton className="h-3.5 flex-1 max-w-[160px] sm:max-w-xs" />
                <div className="ml-auto hidden sm:flex items-center gap-4">
                    <Skeleton className="h-3.5 w-16" />
                    <Skeleton className="h-3.5 w-20" />
                    <Skeleton className="h-3.5 w-16" />
                </div>
            </div>

            {/* Task rows */}
            {Array.from({ length: 7 }).map((_, i) => (
                <div
                    key={i}
                    className="flex items-center gap-2 sm:gap-4 px-3 py-2 sm:py-2.5 border rounded-md
                               border-neutral-200 dark:border-neutral-700"
                    style={{ opacity: Math.max(0.2, 1 - i * 0.12) }}
                >
                    <Skeleton className="h-4 w-4 rounded-sm shrink-0" />
                    <Skeleton className={`h-3.5 ${i % 3 === 0 ? "w-40 sm:w-64" : i % 3 === 1 ? "w-32 sm:w-48" : "w-36 sm:w-56"}`} />
                    <div className="ml-auto hidden sm:flex items-center gap-3 shrink-0">
                        <Skeleton className="h-5 w-14 rounded-full" />
                        <Skeleton className="h-6 w-6 rounded-full" />
                        <Skeleton className="h-3.5 w-20" />
                    </div>
                    <div className="ml-auto flex sm:hidden shrink-0">
                        <Skeleton className="h-5 w-14 rounded-full" />
                    </div>
                </div>
            ))}
        </div>
    );
}

/**
 * TeamPageSkeleton — single responsive skeleton for the /team route.
 */
export function TeamPageSkeleton() {
    return (
        <div className="flex flex-col gap-4 sm:gap-5 w-full overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between gap-3">
                <Skeleton className="h-7 sm:h-9 w-36 sm:w-48" />
                <Skeleton className="h-8 sm:h-9 w-24 sm:w-32 rounded-md" />
            </div>

            {/* Members table */}
            <div className="rounded-md border border-neutral-200 dark:border-neutral-700 overflow-hidden">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead><Skeleton className="h-3.5 w-10" /></TableHead>
                            <TableHead className="hidden sm:table-cell"><Skeleton className="h-3.5 w-10" /></TableHead>
                            <TableHead className="hidden md:table-cell"><Skeleton className="h-3.5 w-20" /></TableHead>
                            <TableHead><Skeleton className="h-3.5 w-12" /></TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {Array.from({ length: 5 }).map((_, i) => (
                            <TableRow key={i} style={{ opacity: Math.max(0.3, 1 - i * 0.15) }}>
                                <TableCell>
                                    <div className="flex items-center gap-2 sm:gap-3">
                                        <Skeleton className="h-8 w-8 sm:h-9 sm:w-9 rounded-full shrink-0" />
                                        <div className="flex flex-col gap-1.5 min-w-0">
                                            <Skeleton className="h-3.5 w-24 sm:w-32" />
                                            <Skeleton className="h-3 w-28 sm:w-44 hidden sm:block" />
                                        </div>
                                    </div>
                                </TableCell>
                                <TableCell className="hidden sm:table-cell">
                                    <Skeleton className="h-5 w-16 rounded-full" />
                                </TableCell>
                                <TableCell className="hidden md:table-cell">
                                    <Skeleton className="h-3.5 w-24" />
                                </TableCell>
                                <TableCell>
                                    <Skeleton className="h-5 w-14 sm:w-16 rounded-full" />
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </div>
        </div>
    );
}

/**
 * SettingsPageSkeleton — single responsive skeleton for the /settings route.
 */
export function SettingsPageSkeleton() {
    return (
        <div className="w-full space-y-6 sm:space-y-8">
            {/* Page title */}
            <div className="space-y-1.5">
                <Skeleton className="h-7 sm:h-8 w-24 sm:w-28" />
                <Skeleton className="h-3.5 w-56 sm:w-72" />
            </div>

            {/* Settings card */}
            <div className="border rounded-lg border-neutral-200 dark:border-neutral-700 overflow-hidden">
                {/* Card header */}
                <div className="p-4 sm:p-6 border-b border-neutral-200 dark:border-neutral-700 flex items-center justify-between gap-3">
                    <div className="space-y-1.5">
                        <Skeleton className="h-5 w-20 sm:w-24" />
                        <Skeleton className="h-3.5 w-40 sm:w-56" />
                    </div>
                    <Skeleton className="h-8 sm:h-9 w-24 sm:w-28 rounded-md shrink-0" />
                </div>

                {/* Tags rows */}
                <div className="divide-y divide-neutral-200 dark:divide-neutral-700">
                    {Array.from({ length: 5 }).map((_, i) => (
                        <div
                            key={i}
                            className="flex items-center justify-between gap-3 px-4 sm:px-6 py-3 sm:py-4"
                            style={{ opacity: Math.max(0.3, 1 - i * 0.15) }}
                        >
                            <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                                <Skeleton className="h-5 w-5 sm:h-6 sm:w-6 rounded-sm shrink-0" />
                                <Skeleton className={`h-3.5 ${i % 2 === 0 ? "w-20 sm:w-28" : "w-16 sm:w-20"}`} />
                                <Skeleton className="h-5 w-10 rounded-full hidden sm:block" />
                            </div>
                            <div className="flex items-center gap-1.5 shrink-0">
                                <Skeleton className="h-7 w-7 sm:h-8 sm:w-8 rounded-md" />
                                <Skeleton className="h-7 w-7 sm:h-8 sm:w-8 rounded-md" />
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
