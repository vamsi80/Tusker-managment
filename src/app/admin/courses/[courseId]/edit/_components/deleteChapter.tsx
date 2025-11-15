"use client";
import { AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Trash2 } from "lucide-react";
import { useState, useTransition } from "react";
import { deleteChapter, deleteLesson } from "../actions";
import { tryCatch } from "@/hooks/try-catch";
import { toast } from "sonner";

export function DeleteChapter(
    {
        chapterId,
        courseId
    }: {
        chapterId: string,
        courseId: string
    }
) {
    const [open, setOpen] = useState(false);
    const [pending, startTransition] = useTransition();

    async function onSubmit() {
        startTransition(async () => {
            const { data: result, error } = await tryCatch(
                deleteChapter({ chapterId, courseId })
            );
            if (error) {
                toast.error("An Error Occured. Please Try Again.");
                return;
            }

            if (result.status === "success") {
                toast.success(result.message);
                setOpen(false);
            } else (
                toast.error(result.message)
            )
        })
    }

    return (
        <AlertDialog open={open} onOpenChange={setOpen}>
            <AlertDialogTrigger asChild>
                <Button variant="ghost" size="icon">
                    <Trash2 className="mr-2 size-4" />
                </Button>
            </AlertDialogTrigger>

            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                    <AlertDialogDescription>
                        This action cannot be undone. This will permanently delete this lesson.
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel>
                        Cancel
                    </AlertDialogCancel>
                    <Button onClick={onSubmit}
                        disabled={pending}
                    >
                        {
                            pending
                                ? "Deleting..."
                                : "Delete"
                        }
                    </Button>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    )
}
