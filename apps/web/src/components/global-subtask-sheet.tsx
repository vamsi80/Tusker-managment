"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import { useSubTaskSheet } from "@/contexts/subtask-sheet-context";
import { Sheet, SheetContent, SheetTitle, SheetDescription } from "@/components/ui/sheet";

const SubTaskDetailsSheet = dynamic(() => import("@/app/w/[workspaceId]/p/[slug]/_components/shared/subtaskSheet/subtask-details-sheet").then(mod => mod.SubTaskDetailsSheet), {
    ssr: false,
    loading: () => null
});


export function GlobalSubTaskSheet() {
    const { isOpen, subTask, closeSubTaskSheet, patchSubTask } = useSubTaskSheet();
    const [shouldRender, setShouldRender] = useState(false);

    useEffect(() => {
        if (isOpen) {
            setShouldRender(true);
        } else {
            // Keep content mounted for exit animation
            const timer = setTimeout(() => {
                setShouldRender(false);
            }, 500);
            return () => clearTimeout(timer);
        }
    }, [isOpen]);

    return (
        <Sheet open={isOpen} onOpenChange={(open) => !open && closeSubTaskSheet()}>
            <SheetContent className="w-full sm:max-w-2xl p-0 flex flex-col h-full bg-background border-l shadow-xl z-[100]">
                <SheetTitle className="sr-only">Subtask Details</SheetTitle>
                <SheetDescription className="sr-only">View and edit subtask details, activities, and messages.</SheetDescription>
                {shouldRender && (
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
