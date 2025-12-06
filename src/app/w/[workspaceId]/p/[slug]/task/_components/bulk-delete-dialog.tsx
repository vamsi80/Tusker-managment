"use client";

import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Loader2 } from "lucide-react";

interface BulkDeleteDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onConfirm: () => void;
    taskCount: number;
    subtaskCount: number;
    isDeleting: boolean;
}

export function BulkDeleteDialog({
    open,
    onOpenChange,
    onConfirm,
    taskCount,
    subtaskCount,
    isDeleting,
}: BulkDeleteDialogProps) {
    const totalCount = taskCount + subtaskCount;

    return (
        <AlertDialog open={open} onOpenChange={onOpenChange}>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>Delete {totalCount} item{totalCount !== 1 ? 's' : ''}?</AlertDialogTitle>
                    <AlertDialogDescription>
                        This action cannot be undone. This will permanently delete:
                        <ul className="list-disc list-inside mt-2 space-y-1">
                            {taskCount > 0 && (
                                <li className="font-medium">
                                    {taskCount} task{taskCount !== 1 ? 's' : ''}
                                    {taskCount > 0 && <span className="text-muted-foreground text-sm"> (and all their subtasks)</span>}
                                </li>
                            )}
                            {subtaskCount > 0 && (
                                <li className="font-medium">
                                    {subtaskCount} subtask{subtaskCount !== 1 ? 's' : ''}
                                </li>
                            )}
                        </ul>
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                        onClick={(e) => {
                            e.preventDefault();
                            onConfirm();
                        }}
                        disabled={isDeleting}
                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    >
                        {isDeleting ? (
                            <>
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                Deleting...
                            </>
                        ) : (
                            'Delete'
                        )}
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    );
}
