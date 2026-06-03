"use client";

import { useState, useTransition } from "react";
import { Trash2, Loader2, AlertTriangle } from "lucide-react";
import { useParams } from "next/navigation";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { tryCatch } from "@/hooks/try-catch";
import { apiClient, type ApiResponse } from "@/lib/api-client";
import { useReloadView } from "@/hooks/use-reload-view";

// Generic subtask type that works with any subtask structure
type SubTaskBase = {
    id: string;
    name: string;
};

interface DeleteSubTaskFormProps<T extends SubTaskBase> {
    subTask: T;
    onSubTaskDeleted?: (subTaskId: string) => void;
    trigger?: React.ReactNode;
    open?: boolean;
    onOpenChange?: (open: boolean) => void;
}

export function DeleteSubTaskForm<T extends SubTaskBase>({ 
    subTask, 
    onSubTaskDeleted,
    trigger,
    open: controlledOpen,
    onOpenChange: controlledOnOpenChange
}: DeleteSubTaskFormProps<T>) {
    const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
    const isControlled = controlledOpen !== undefined;
    const open = isControlled ? controlledOpen : uncontrolledOpen;
    const setOpen = controlledOnOpenChange || setUncontrolledOpen;

    const [pending, startTransition] = useTransition();
    const params = useParams();
    const reloadView = useReloadView();
    const workspaceId = (params.workspaceId as string) || (subTask as any).workspaceId || "";
    const projectId = (subTask as any).projectId || "";

    const handleDelete = () => {
        startTransition(async () => {
            // Optimistically remove from UI first
            if (onSubTaskDeleted) {
                onSubTaskDeleted(subTask.id);
            }

            const res = await tryCatch(apiClient.tasks.deleteTask(
                subTask.id, 
                workspaceId,
                projectId
            ));

            if (res.error) {
                toast.error(res.error.message);
                console.error(res.error);
                return;
            }

            // Defensive casting to overcome module resolution issues
            const response = res.data as ApiResponse;
            const { status: responseStatus, message: responseMessage } = response;

            if (responseStatus === "success") {
                toast.success(responseMessage);
                reloadView();
                setOpen(false);
            } else {
                // If it failed on server, we might want to reload to sync UI
                toast.error(responseMessage);
                // TODO: Revert optimistic update on error
            }
        });
    };

    return (
        <AlertDialog open={open} onOpenChange={setOpen}>
            {!isControlled && (
                <AlertDialogTrigger asChild>
                    {trigger || (
                        <Button
                            variant="ghost"
                            size="sm"
                            className="w-full justify-start text-destructive hover:text-destructive hover:bg-destructive/10"
                        >
                            <Trash2 className="mr-2 size-4" />
                            Delete SubTask
                        </Button>
                    )}
                </AlertDialogTrigger>
            )}
            <AlertDialogContent>
                <AlertDialogHeader>
                    <div className="flex items-center gap-2">
                        <div className="flex size-10 items-center justify-center rounded-full bg-destructive/10">
                            <AlertTriangle className="size-5 text-destructive" />
                        </div>
                        <AlertDialogTitle>Delete SubTask</AlertDialogTitle>
                    </div>
                    <AlertDialogDescription asChild className="space-y-2 pt-3">
                        <div>
                            <p>
                                Are you sure you want to delete <span className="font-semibold text-foreground">"{subTask.name}"</span>?
                            </p>
                            <p className="text-sm">
                                This action cannot be undone. This will permanently delete the subtask and all its data.
                            </p>
                        </div>
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                        onClick={(e) => {
                            e.preventDefault();
                            handleDelete();
                        }}
                        disabled={pending}
                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    >
                        {pending ? (
                            <>
                                Deleting...
                                <Loader2 className="ml-2 size-4 animate-spin" />
                            </>
                        ) : (
                            <>
                                Delete SubTask
                                <Trash2 className="ml-2 size-4" />
                            </>
                        )}
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    );
}
