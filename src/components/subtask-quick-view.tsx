"use client";

import { Button } from "@/components/ui/button";
import { useSubTaskSheet } from "@/contexts/subtask-sheet-context";
import { FlatTaskType, SubTaskType, PaginatedSubTaskType } from "@/data/task";

/**
 * Example component showing how to use the global subtask sheet
 * This can be used from anywhere in the application
 */
export function SubTaskQuickView({
    subtask
}: {
    subtask: FlatTaskType | SubTaskType | PaginatedSubTaskType
}) {
    const { openSubTaskSheet } = useSubTaskSheet();

    return (
        <Button
            variant="ghost"
            size="sm"
            onClick={() => openSubTaskSheet(subtask)}
            className="h-8 px-2"
        >
            View Details
        </Button>
    );
}

/**
 * Example: Opening subtask by ID (when you need to fetch data first)
 */
export function SubTaskLinkById({
    subtaskId,
    onFetchSubtask
}: {
    subtaskId: string;
    onFetchSubtask: (id: string) => Promise<FlatTaskType | SubTaskType | PaginatedSubTaskType>;
}) {
    const { openSubTaskSheet } = useSubTaskSheet();

    const handleClick = async () => {
        try {
            const subtask = await onFetchSubtask(subtaskId);
            openSubTaskSheet(subtask);
        } catch (error) {
            console.error("Failed to fetch subtask:", error);
        }
    };

    return (
        <button
            onClick={handleClick}
            className="text-blue-600 hover:underline"
        >
            #{subtaskId.slice(0, 8)}
        </button>
    );
}
