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
import { createTask } from "../../action";
import { useRouter } from "next/navigation";
import { useTaskContext } from "../task-context";

interface iAppProps {
    projectId: string
}

export const CreateTaskForm = ({ projectId }: iAppProps) => {
    const [Pending, startTransition] = useTransition();
    const { triggerConfetti } = useConfetti();
    const [open, setOpen] = useState(false);
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
