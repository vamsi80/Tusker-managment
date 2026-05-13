"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef } from "react";
import { useSubTaskSheet } from "@/contexts/subtask-sheet-context";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";

function SubTaskSheetSkeleton() {
    // This is a minimal version of the skeleton that can run while the main chunk is loading
    // It reads the URL to show the correct tab layout (Messages vs Activity)
    const searchParams = typeof window !== "undefined" ? new URLSearchParams(window.location.search) : null;
    const isActivity = searchParams?.get("tab") === "activity";

    return (
        <div className="flex flex-col h-full bg-background">
            {/* Header Skeleton */}
            <div className="p-6 space-y-4 border-b">
                <div className="flex items-center justify-between">
                    <div className="h-6 w-32 bg-muted animate-pulse rounded" />
                    <div className="flex gap-2">
                        <div className="h-8 w-8 bg-muted animate-pulse rounded-full" />
                        <div className="h-8 w-8 bg-muted animate-pulse rounded-full" />
                    </div>
                </div>
                <div className="h-8 w-3/4 bg-muted animate-pulse rounded" />
                <div className="flex gap-4">
                    <div className="h-5 w-20 bg-muted animate-pulse rounded-full" />
                    <div className="h-5 w-20 bg-muted animate-pulse rounded-full" />
                </div>
            </div>
            {/* Nav Skeleton */}
            <div className="flex gap-4 p-4 border-b">
                <div className="h-8 w-24 bg-muted animate-pulse rounded" />
                <div className="h-8 w-24 bg-muted animate-pulse rounded" />
            </div>
            {/* Content Skeleton - Matches intended tab */}
            <div className="flex-1 p-6 space-y-4">
                {isActivity ? (
                    <div className="space-y-4">
                        {[1, 2, 3].map((i) => (
                            <div key={i} className="h-32 w-full bg-muted animate-pulse rounded-lg" />
                        ))}
                    </div>
                ) : (
                    <div className="space-y-6">
                        {[1, 2, 3, 4].map((i) => (
                            <div key={i} className={`flex w-full ${i % 2 === 0 ? "justify-end" : "justify-start"}`}>
                                <div className={`h-16 w-full max-w-[70%] bg-muted animate-pulse rounded-lg ${i % 2 === 0 ? "rounded-tr-none" : "rounded-tl-none"}`} />
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}

const SubTaskDetailsSheet = dynamic(() => import("@/app/w/[workspaceId]/p/[slug]/_components/shared/subtaskSheet/subtask-details-sheet").then(mod => mod.SubTaskDetailsSheet), {
    ssr: false,
    loading: () => <SubTaskSheetSkeleton />
});


export function GlobalSubTaskSheet() {
    const { isOpen, subTask, openSubTaskSheetLoading, closeSubTaskSheet, patchSubTask } = useSubTaskSheet();

    return (
        <Sheet open={isOpen} onOpenChange={(open) => !open && closeSubTaskSheet()}>
            <SheetContent className="w-full sm:max-w-2xl p-0 flex flex-col h-full bg-background border-l shadow-xl z-[100]">
                <SheetTitle className="sr-only">Subtask Details</SheetTitle>
                {isOpen && (
                    <SubTaskDetailsSheet
                        subTask={subTask}
                        isOpen={isOpen}
                        onClose={closeSubTaskSheet}
                        onSubTaskAssigned={patchSubTask}
                    />
                )}
            </SheetContent>
        </Sheet>
    );
}
