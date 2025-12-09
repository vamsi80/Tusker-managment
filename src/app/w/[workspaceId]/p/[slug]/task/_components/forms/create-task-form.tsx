"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useState, useTransition, useEffect } from "react";
import { Resolver, useForm } from "react-hook-form";
import { Loader2, Plus, PlusIcon, SparkleIcon } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { taskSchema, TaskSchemaType } from "@/lib/zodSchemas";
import { tryCatch } from "@/hooks/try-catch";
import { useConfetti } from "@/hooks/use-confetti";
import { toast } from "sonner";
import slugify from "slugify";
import { createTask } from "../../action";
import { useRouter } from "next/navigation";
import { useTaskContext } from "../shared/task-context";

interface iAppProps {
    projectId: string
}

export const CreateTaskForm = ({ projectId }: iAppProps) => {
    const [Pending, startTransition] = useTransition();
    const { triggerConfetti } = useConfetti();
    const [open, setOpen] = useState(false);
    const [autoSlugEnabled, setAutoSlugEnabled] = useState(true);
    const router = useRouter();
    const { addNewTask, setIsAddingTask } = useTaskContext();

    const form = useForm<TaskSchemaType>({
        resolver: zodResolver(taskSchema) as unknown as Resolver<TaskSchemaType>,
        defaultValues: {
            name: "",
            taskSlug: "",
            projectId: projectId,
        },
    })

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
        startTransition(async () => {
            setIsAddingTask(true); // Show skeleton
            const { data: result, error } = await tryCatch(createTask(values));

            if (error) {
                toast.error(error.message);
                console.error(error);
                setIsAddingTask(false);
                return;
            }

            if (result.status === "success" && result.data) {
                toast.success(result.message);
                triggerConfetti();
                form.reset();
                setOpen(false);

                // Add the new task to the list
                addNewTask(result.data as any);
            } else {
                toast.error(result.message);
                setIsAddingTask(false);
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
        <>
            <Dialog open={open} onOpenChange={setOpen}>
                <DialogTrigger asChild>
                    <Button
                        className="cursor-pointer">
                        Create Task
                    </Button>
                </DialogTrigger>
                <DialogContent >
                    <DialogHeader>
                        <DialogTitle>Create New Task</DialogTitle>
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
                                                <Input placeholder="Enter task title" {...field} />
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                                <div className=" flex gap-4 items-end">
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

                                <div className="flex flex-row items-center gap-4">
                                    <Button type="submit" disabled={Pending} className="cursor-pointer">
                                        {
                                            Pending ? (
                                                <>
                                                    Creating...
                                                    <Loader2 className="ml-1 h-4 w-4 animate-spin" />
                                                </>
                                            ) : (
                                                <>
                                                    Create Task
                                                    <PlusIcon className="ml-1" size={16} />
                                                </>
                                            )
                                        }
                                    </Button>
                                </div>
                            </form>
                        </Form>
                    </div>
                </DialogContent>
            </Dialog>
        </>
    );
};
