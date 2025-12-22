"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useState, useTransition, useEffect } from "react";
import { Resolver, useForm } from "react-hook-form";
import { Loader2, Pencil, SparkleIcon } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { taskSchema, TaskSchemaType } from "@/lib/zodSchemas";
import { tryCatch } from "@/hooks/try-catch";
import { toast } from "sonner";
import slugify from "slugify";
import { editTask } from "@/actions/task/update-task";
import { TaskWithSubTasks } from "../list/types";
import { useReloadView } from "@/hooks/use-reload-view";

interface EditTaskDialogProps {
    task: TaskWithSubTasks;
    onTaskUpdated?: (updatedTask: { name: string; taskSlug: string }) => void;
    onUpdateStart?: () => void;
    onUpdateEnd?: () => void;
}

/**
 * Dialog component for editing a main task
 * - Only updates if there are actual changes
 * - Auto-generates slug when task name changes
 * - Shows skeleton for specific task during update
 * - Auto-refreshes task list after update
 */
export function EditTaskDialog({ task, onTaskUpdated, onUpdateStart, onUpdateEnd }: EditTaskDialogProps) {
    const [pending, startTransition] = useTransition();
    const [open, setOpen] = useState(false);
    const [autoSlugEnabled, setAutoSlugEnabled] = useState(true);
    const reloadView = useReloadView();

    const form = useForm<TaskSchemaType>({
        resolver: zodResolver(taskSchema) as unknown as Resolver<TaskSchemaType>,
        defaultValues: {
            name: task.name,
            taskSlug: task.taskSlug,
            projectId: task.projectId,
        },
    });

    // Auto-update slug when task name changes
    useEffect(() => {
        if (!autoSlugEnabled || !open) return;

        const subscription = form.watch((value, { name: fieldName }) => {
            if (fieldName === 'name' && value.name) {
                const newSlug = slugify(value.name, { lower: true, strict: true });
                form.setValue('taskSlug', newSlug, { shouldValidate: false });
            }
        });

        return () => subscription.unsubscribe();
    }, [form, autoSlugEnabled, open]);

    // Reset auto-slug when dialog opens
    useEffect(() => {
        if (open) {
            setAutoSlugEnabled(true);
        }
    }, [open]);

    function onSubmit(values: TaskSchemaType) {
        // Check if there are any actual changes
        const hasChanges =
            values.name !== task.name ||
            values.taskSlug !== task.taskSlug;

        if (!hasChanges) {
            toast.info("No changes detected");
            setOpen(false);
            return;
        }

        startTransition(async () => {
            const { data: result, error } = await tryCatch(editTask(values, task.id));

            if (error) {
                toast.error(error.message);
                console.error(error);
                return;
            }

            if (result.status === "success") {
                toast.success(result.message);
                setOpen(false);

                // Pass the updated data to the callback
                // This allows immediate UI update without waiting for router.refresh()
                if (onTaskUpdated) {
                    onTaskUpdated({
                        name: values.name,
                        taskSlug: values.taskSlug,
                    });
                }

                // Reload all views to show the updated task
                reloadView();
            } else {
                toast.error(result.message);
            }
        });
    }

    const handleManualSlugGenerate = () => {
        const nameValue = form.getValues("name") || "";
        const slug = slugify(nameValue, { lower: true, strict: true });
        form.setValue('taskSlug', slug, { shouldValidate: true });
        setAutoSlugEnabled(true); // Re-enable auto-slug
    };

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <Button variant="ghost" size="sm" className="w-full justify-start">
                    <Pencil className="mr-2 h-4 w-4" />
                    Edit Task
                </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[500px]">
                <DialogHeader>
                    <DialogTitle>Edit Task</DialogTitle>
                </DialogHeader>
                <div className="mt-4">
                    <Form {...form}>
                        <form
                            onSubmit={form.handleSubmit(onSubmit, (errors) => console.log("Validation Errors:", errors))}
                            className="space-y-5"
                        >
                            <FormField
                                control={form.control}
                                name="name"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Task Title</FormLabel>
                                        <FormControl>
                                            <Input
                                                placeholder="Enter task title"
                                                {...field}
                                            />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                            <div className="flex gap-4 items-end">
                                <FormField
                                    control={form.control}
                                    name="taskSlug"
                                    render={({ field }) => (
                                        <FormItem className="w-full">
                                            <FormLabel>
                                                Slug
                                                {autoSlugEnabled && (
                                                    <span className="text-xs text-muted-foreground ml-2">
                                                        (auto-updating)
                                                    </span>
                                                )}
                                            </FormLabel>
                                            <FormControl>
                                                <Input
                                                    placeholder="Slug"
                                                    {...field}
                                                    onChange={(e) => {
                                                        field.onChange(e);
                                                        // Disable auto-slug if user manually edits
                                                        setAutoSlugEnabled(false);
                                                    }}
                                                />
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                                <Button
                                    type="button"
                                    variant="outline"
                                    className="w-fit shrink-0"
                                    onClick={handleManualSlugGenerate}
                                >
                                    <SparkleIcon className="mr-1" size={16} />
                                    Generate
                                </Button>
                            </div>

                            <div className="flex flex-row items-center gap-4 pt-4">
                                <Button
                                    type="button"
                                    variant="outline"
                                    onClick={() => {
                                        setOpen(false);
                                        form.reset();
                                        setAutoSlugEnabled(true);
                                    }}
                                    disabled={pending}
                                >
                                    Cancel
                                </Button>
                                <Button type="submit" disabled={pending} className="cursor-pointer">
                                    {pending ? (
                                        <>
                                            Updating...
                                            <Loader2 className="ml-1 h-4 w-4 animate-spin" />
                                        </>
                                    ) : (
                                        <>
                                            Update Task
                                            <Pencil className="ml-1" size={16} />
                                        </>
                                    )}
                                </Button>
                            </div>
                        </form>
                    </Form>
                </div>
            </DialogContent>
        </Dialog>
    );
}
