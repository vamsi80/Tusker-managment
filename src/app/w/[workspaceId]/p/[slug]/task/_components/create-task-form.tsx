"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useState, useTransition } from "react";
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
import { createTask } from "../action";

interface iAppProps {
    projectId: string
}

export const CreateTaskForm = ({ projectId }: iAppProps) => {
    const [pending, startTransition] = useTransition();
    const { triggerConfetti } = useConfetti();
    const [open, setOpen] = useState(false);

    // this state reflects the actual network request lifecycle (unlike `pending`)
    const [isSubmitting, setIsSubmitting] = useState(false);

    const form = useForm<TaskSchemaType>({
        resolver: zodResolver(taskSchema) as unknown as Resolver<TaskSchemaType>,
        defaultValues: {
            name: "",
            taskSlug: "",
            projectId: projectId,
        },
    })

    console.log("pending", pending);
    console.log("isSubmitting", isSubmitting);

    async function onSubmit(values: TaskSchemaType) {
        // set the real "network" submitting flag
        setIsSubmitting(true);

        // keep your startTransition wrapper (it marks state updates as low-priority)
        startTransition(async () => {
            try {
                // If your tryCatch expects a function, pass a function; otherwise this awaits the promise result.
                const { data: result, error } = await tryCatch(createTask(values));

                if (error) {
                    toast.error(error.message ?? "Something went wrong");
                    console.error(error);
                    return;
                }

                if (result?.status === "success") {
                    toast.success(result.message ?? "Task created");
                    triggerConfetti();
                    form.reset();
                    setOpen(false);
                } else {
                    toast.error(result?.message ?? "Failed to create task");
                }
            } catch (err) {
                console.error("createTask error:", err);
                toast.error((err as Error)?.message ?? "Unexpected error");
            } finally {
                // unset the real submitting flag
                setIsSubmitting(false);
            }
        });
    }

    return (
        <>
            <Dialog open={open} onOpenChange={setOpen}>
                <DialogTrigger asChild>
                    <Button
                        className="cursor-pointer">
                        Create Task
                        <Plus size={16} />
                    </Button>
                </DialogTrigger>
                <DialogContent >
                    <DialogHeader>
                        <DialogTitle>Create New Task</DialogTitle>
                    </DialogHeader>
                    <div className="mt-4">
                        <Form {...form}>
                            <form
                                onSubmit={form.handleSubmit(onSubmit)}
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
                                                <FormLabel>Slug</FormLabel>
                                                <FormControl>
                                                    <Input placeholder="Slug"{...field} />
                                                </FormControl>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                    <Button type="button" className="w-fit" onClick={() => {
                                        const nameValue = form.getValues("name") || "";
                                        const slug = slugify(nameValue, { lower: true, strict: true });

                                        form.setValue('taskSlug', slug, { shouldValidate: true })
                                    }}>
                                        Generate Slug <SparkleIcon className="ml-1" size={16} />
                                    </Button>
                                </div>

                                <div className="flex flex-row items-center gap-4 cursor-pointer">
                                    <Button type="submit" disabled={isSubmitting || pending}>
                                        {
                                            (isSubmitting || pending) ? (
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
