"use client";

import React from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";

export function WorkspaceSkeleton() {
    return (
        <div className="flex h-svh w-full overflow-hidden bg-background">
            {/* Sidebar Skeleton */}
            <aside className="hidden w-(--sidebar-width) flex-col border-r border-border/50 md:flex">
                <div className="flex h-(--header-height) items-center px-4">
                    <Skeleton className="h-8 w-full rounded-lg" />
                </div>
                <div className="flex-1 space-y-4 p-4">
                    <div className="space-y-2">
                        <Skeleton className="h-4 w-24" />
                        <Skeleton className="h-8 w-full" />
                        <Skeleton className="h-8 w-full" />
                        <Skeleton className="h-8 w-full" />
                    </div>
                    <Separator className="mx-0" />
                    <div className="space-y-2">
                        <Skeleton className="h-4 w-20" />
                        <Skeleton className="h-8 w-full" />
                        <Skeleton className="h-8 w-full" />
                    </div>
                </div>
                <div className="p-4">
                    <Skeleton className="h-12 w-full rounded-xl" />
                </div>
            </aside>

            {/* Main Content Skeleton */}
            <div className="flex flex-1 flex-col">
                <header className="flex h-(--header-height) shrink-0 items-center justify-between border-b px-4 lg:px-6">
                    <div className="flex items-center gap-2">
                        <Skeleton className="size-8 rounded-md md:hidden" />
                        <Skeleton className="h-4 w-32" />
                    </div>
                    <div className="flex items-center gap-3">
                        <Skeleton className="h-8 w-24 rounded-full" />
                        <Skeleton className="size-8 rounded-full" />
                        <Skeleton className="size-8 rounded-full" />
                    </div>
                </header>
                <main className="flex-1 overflow-auto p-4 sm:p-6 lg:p-8">
                    <div className="w-full space-y-6">
                        <div className="space-y-2">
                            <Skeleton className="h-10 w-48" />
                            <Skeleton className="h-4 w-96" />
                        </div>
                        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                            <Skeleton className="h-48 w-full rounded-xl" />
                            <Skeleton className="h-48 w-full rounded-xl" />
                            <Skeleton className="h-48 w-full rounded-xl" />
                        </div>
                    </div>
                </main>
            </div>
        </div>
    );
}
