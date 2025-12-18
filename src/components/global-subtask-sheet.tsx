"use client";

import { useSubTaskSheet } from "@/contexts/subtask-sheet-context";
import { SubTaskDetailsSheet } from "@/app/w/[workspaceId]/p/[slug]/_components/shared/subtaskSheet/subtask-details-sheet";

/**
 * Global SubTask Sheet Wrapper
 * 
 * Connects the global context to the SubTaskDetailsSheet component
 * Place this in app/layout.tsx inside SubTaskSheetProvider
 */
export function GlobalSubTaskSheet() {
    const { isOpen, subTask, closeSubTaskSheet } = useSubTaskSheet();

    return (
        <SubTaskDetailsSheet
            subTask={subTask}
            isOpen={isOpen}
            onClose={closeSubTaskSheet}
        />
    );
}
