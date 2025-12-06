"use client";

import { useState, useTransition } from "react";
import { Loader2, Plus, Trash2, ListPlus } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { tryCatch } from "@/hooks/try-catch";
import { useConfetti } from "@/hooks/use-confetti";
import { toast } from "sonner";
import slugify from "slugify";
import { bulkCreateTasks } from "../../action";
import { useRouter } from "next/navigation";
import { useTaskContext } from "../task-context";
import { ScrollArea } from "@/components/ui/scroll-area";

interface BulkCreateTaskFormProps {
    projectId: string;
}

interface TaskInput {
    id: string;
    name: string;
    slug: string;
}

export const BulkCreateTaskForm = ({ projectId }: BulkCreateTaskFormProps) => {
    const [pending, startTransition] = useTransition();
    const { triggerConfetti } = useConfetti();
    const [open, setOpen] = useState(false);
    const router = useRouter();
    const { setIsAddingTask } = useTaskContext();

    // Initialize with 3 empty task inputs
    const [tasks, setTasks] = useState<TaskInput[]>([
        { id: crypto.randomUUID(), name: "", slug: "" },
        { id: crypto.randomUUID(), name: "", slug: "" },
        { id: crypto.randomUUID(), name: "", slug: "" },
    ]);

    const addTaskInput = () => {
        setTasks([...tasks, { id: crypto.randomUUID(), name: "", slug: "" }]);
    };

    const removeTaskInput = (id: string) => {
        if (tasks.length > 1) {
            setTasks(tasks.filter((task) => task.id !== id));
        }
    };

    const updateTaskName = (id: string, name: string) => {
        setTasks(
            tasks.map((task) =>
                task.id === id
                    ? {
                        ...task,
                        name,
                        slug: slugify(name, { lower: true, strict: true }),
                    }
                    : task
            )
        );
    };

    const updateTaskSlug = (id: string, slug: string) => {
        setTasks(tasks.map((task) => (task.id === id ? { ...task, slug } : task)));
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        // Filter out empty tasks
        const validTasks = tasks.filter((task) => task.name.trim() !== "");

        if (validTasks.length === 0) {
            toast.error("Please add at least one task");
            return;
        }

        // Check for duplicate slugs
        const slugs = validTasks.map((t) => t.slug);
        const duplicateSlugs = slugs.filter((slug, index) => slugs.indexOf(slug) !== index);
        if (duplicateSlugs.length > 0) {
            toast.error(`Duplicate slugs found: ${duplicateSlugs.join(", ")}`);
            return;
        }

        startTransition(async () => {
            setIsAddingTask(true);
            const { data: result, error } = await tryCatch(
                bulkCreateTasks({
                    projectId,
                    tasks: validTasks.map((t) => ({ name: t.name, taskSlug: t.slug })),
                })
            );

            if (error) {
                toast.error(error.message);
                console.error(error);
                setIsAddingTask(false);
                return;
            }

            if (result.status === "success") {
                toast.success(result.message || `${validTasks.length} tasks created successfully`);
                triggerConfetti();

                // Reset form
                setTasks([
                    { id: crypto.randomUUID(), name: "", slug: "" },
                    { id: crypto.randomUUID(), name: "", slug: "" },
                    { id: crypto.randomUUID(), name: "", slug: "" },
                ]);
                setOpen(false);

                // Refresh the page to show new tasks
                router.refresh();
            } else {
                toast.error(result.message);
                setIsAddingTask(false);
            }
        });
    };

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <Button variant="outline" className="gap-2">
                    <ListPlus className="h-4 w-4" />
                    Bulk Create
                </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl">
                <DialogHeader>
                    <DialogTitle>Bulk Create Tasks</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="space-y-4">
                    <ScrollArea className="h-[400px] pr-4">
                        <div className="space-y-4">
                            {tasks.map((task, index) => (
                                <div
                                    key={task.id}
                                    className="flex gap-3 items-start p-4 border rounded-lg bg-muted/30"
                                >
                                    <div className="flex-1 space-y-3">
                                        <div className="flex items-center gap-2">
                                            <span className="text-sm font-medium text-muted-foreground w-8">
                                                #{index + 1}
                                            </span>
                                            <div className="flex-1">
                                                <Label htmlFor={`task-name-${task.id}`} className="sr-only">
                                                    Task Name
                                                </Label>
                                                <Input
                                                    id={`task-name-${task.id}`}
                                                    placeholder="Task name"
                                                    value={task.name}
                                                    onChange={(e) => updateTaskName(task.id, e.target.value)}
                                                    disabled={pending}
                                                />
                                            </div>
                                        </div>
                                        <div className="pl-10">
                                            <Label htmlFor={`task-slug-${task.id}`} className="text-xs text-muted-foreground">
                                                Slug (auto-generated)
                                            </Label>
                                            <Input
                                                id={`task-slug-${task.id}`}
                                                placeholder="task-slug"
                                                value={task.slug}
                                                onChange={(e) => updateTaskSlug(task.id, e.target.value)}
                                                disabled={pending}
                                                className="mt-1"
                                            />
                                        </div>
                                    </div>
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        size="icon"
                                        onClick={() => removeTaskInput(task.id)}
                                        disabled={tasks.length === 1 || pending}
                                        className="mt-1"
                                    >
                                        <Trash2 className="h-4 w-4 text-destructive" />
                                    </Button>
                                </div>
                            ))}
                        </div>
                    </ScrollArea>

                    <div className="flex items-center justify-between pt-4 border-t">
                        <Button
                            type="button"
                            variant="outline"
                            onClick={addTaskInput}
                            disabled={pending}
                            className="gap-2"
                        >
                            <Plus className="h-4 w-4" />
                            Add Another Task
                        </Button>

                        <div className="flex gap-2">
                            <Button
                                type="button"
                                variant="ghost"
                                onClick={() => setOpen(false)}
                                disabled={pending}
                            >
                                Cancel
                            </Button>
                            <Button type="submit" disabled={pending}>
                                {pending ? (
                                    <>
                                        Creating...
                                        <Loader2 className="ml-2 h-4 w-4 animate-spin" />
                                    </>
                                ) : (
                                    <>
                                        Create {tasks.filter((t) => t.name.trim()).length} Tasks
                                    </>
                                )}
                            </Button>
                        </div>
                    </div>
                </form>
            </DialogContent>
        </Dialog>
    );
};
