"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useState, useTransition, useEffect } from "react";
import { Resolver, useForm, useWatch } from "react-hook-form";
import { Loader2, PlusIcon } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { taskSchema, TaskSchemaType } from "@/lib/zodSchemas";
import { tryCatch } from "@/lib/try-catch";
import { useConfetti } from "@/hooks/use-confetti";
import { toast } from "sonner";
import slugify from "slugify";
import { useTaskContext } from "@/app/w/[workspaceId]/_components/shared/task-context";
import { apiClient } from "@/lib/api-client";
import { getColorFromString } from "@/lib/colors/project-colors";

interface iAppProps {
    workspaceId: string;
    projectId?: string; // Optional for workspace-level
    level?: "workspace" | "project"; // Explicitly define the level
    projects?: { id: string; name: string; color?: string; }[]; // For workspace-level project selection
}

export const CreateTaskForm = ({
    projectId,
    level = "project", // Default to project level for backward compatibility
    projects = [], // Default to empty array
}: iAppProps) => {
    const [Pending, startTransition] = useTransition();
    const { triggerConfetti } = useConfetti();
    const [open, setOpen] = useState(false);
    const [autoSlugEnabled, setAutoSlugEnabled] = useState(true);
    const { addNewTask, updateTask, removeTask } = useTaskContext();

    const form = useForm<TaskSchemaType>({
        resolver: zodResolver(taskSchema as any),
        defaultValues: {
            name: "",
            taskSlug: "",
            projectId: projectId || (projects.length > 0 ? projects[0].id : ""),
        },
    })

    const watchedName = useWatch({
        control: form.control,
        name: "name",
    });

    const watchedTaskSlug = useWatch({
        control: form.control,
        name: "taskSlug",
    });

    useEffect(() => {
        if (!autoSlugEnabled || !open) return;
        if (!watchedName) return;

        const newSlug = slugify(watchedName, { lower: true, strict: true });
        form.setValue("taskSlug", newSlug, { shouldValidate: false });
    }, [watchedName, autoSlugEnabled, open, form]);

    useEffect(() => {
        if (open) {
            setAutoSlugEnabled(true);
        }
    }, [open]);

    function onSubmit(values: TaskSchemaType) {
        startTransition(async () => {
            const { data: result, error } = await tryCatch(apiClient.tasks.createTask(values));

            if (error) {
                toast.error(error.message);
                console.error(error);
                return;
            }

            if (result.status === "success" && result.data) {
                toast.success(result.message);
                triggerConfetti();
                setOpen(false);
                form.reset();
                // Task will be added to UI via RealtimeNotificationListener
            } else {
                toast.error(result.message);
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
                                            <input type="hidden" {...form.register("taskSlug")} />
                                            {watchedTaskSlug && (
                                                <p className="text-[10px] text-muted-foreground mt-1 px-1">
                                                    Slug: <span className="font-mono">{watchedTaskSlug}</span>
                                                </p>
                                            )}
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />

                                {/* Project Selection - Only for workspace level */}
                                {level === "workspace" && projects.length > 0 && (
                                    <FormField
                                        control={form.control}
                                        name="projectId"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>Project</FormLabel>
                                                <Select onValueChange={field.onChange} value={field.value}>
                                                    <FormControl>
                                                        <SelectTrigger>
                                                            <SelectValue placeholder="Select a project" />
                                                        </SelectTrigger>
                                                    </FormControl>
                                                    <SelectContent>
                                                        {projects.map((project) => (
                                                            <SelectItem key={project.id} value={project.id}>
                                                                <div className="flex items-center gap-2">
                                                                    <div className="size-2 rounded-full border shadow-sm" style={{ backgroundColor: project.color || getColorFromString(project.name) }} />
                                                                    {project.name}
                                                                </div>
                                                            </SelectItem>
                                                        ))}
                                                    </SelectContent>
                                                </Select>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                )}

                                <div className="flex flex-row items-center gap-4">
                                    <Button type="submit" disabled={Pending} className="cursor-pointer">
                                        {
                                            Pending ? (
                                                <>
                                                    Creating...
                                                    <Loader2 className="ml-1 size-4 animate-spin" />
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
