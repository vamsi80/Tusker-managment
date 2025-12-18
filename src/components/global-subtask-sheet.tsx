"use client";

import { SubTaskDetailsSheet } from "@/app/w/[workspaceId]/p/[slug]/_components/shared/subtaskSheet/subtask-details-sheet";
import { useSubTaskSheet } from "@/contexts/subtask-sheet-context";

/**
 * Global SubTask Sheet Wrapper
 * This component should be placed at the root level of the application
 * It listens to the global subtask sheet context and renders the sheet when needed
 * 
 * URL Sync: Enabled - The sheet will update the URL with ?subtask={id} when opened
 * This allows users to share and bookmark specific subtask views
 */
export function GlobalSubTaskSheet() {
    const { isOpen, subTask, closeSubTaskSheet } = useSubTaskSheet();

    return (
        <SubTaskDetailsSheet
            subTask={subTask}
            isOpen={isOpen}
            onClose={closeSubTaskSheet}
        // URL sync is enabled by default (disableUrlSync is false)
        />
    );
}
