"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useState, useTransition } from "react";
import { Resolver, useForm } from "react-hook-form";
import { Loader2, Plus, PlusIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { taskSchema, TaskSchemaType } from "@/lib/zodSchemas";
import { tryCatch } from "@/hooks/try-catch";
import { useConfetti } from "@/hooks/use-confetti";
import { toast } from "sonner";
import { createTask } from "../[slug]/actions";

interface iAppProps {
    projectId: string
}

export const CreateTaskForm = ({ projectId }: iAppProps) => {
    const [pending, startTransition] = useTransition();
    const { triggerConfetti } = useConfetti();
    const [open, setOpen] = useState(false);

    const form = useForm<TaskSchemaType>({
        resolver: zodResolver(taskSchema) as unknown as Resolver<TaskSchemaType>,
        defaultValues: {
            name: "",
            projectId: projectId,
        },
    })

    function onSubmit(values: TaskSchemaType) {
        startTransition(async () => {
            console.log("button clicked");
            const { data: result, error } = await tryCatch(createTask(values));
            console.log("results", { result });

            if (error) {
                toast.error(error.message);
                console.error(error);
                return;
            }

            if (result.status === "success") {
                toast.success(result.message);
                triggerConfetti();
                form.reset();
                setOpen(false);
            } else (
                toast.error(result.message)
            )
        });
    }

    return (
        <>
            <Dialog>
                <DialogTrigger asChild>
                    <Button
                        onClick={() => setOpen(true)}
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
                                                <Input placeholder="Enter workspace name" {...field} />
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />

                                <div className="flex flex-row items-center gap-4 cursor-pointer">
                                    <Button type="submit" disabled={pending}>
                                        {
                                            pending ? (
                                                <>
                                                    Creating...
                                                    <Loader2 className="ml-1 h-4 w-4 animate-spin" />
                                                </>
                                            ) : (
                                                <>
                                                    Create Course
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
