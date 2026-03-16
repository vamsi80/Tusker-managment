"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useState, useTransition, useEffect, useMemo } from "react";
import { Resolver, useForm, useWatch } from "react-hook-form";
import { Check, Loader2, Pencil } from "lucide-react";
import { useRouter } from "next/navigation";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { subTaskSchema, SubTaskSchemaType } from "@/lib/zodSchemas";
import { tryCatch } from "@/hooks/try-catch";
import { toast } from "sonner";
import type { ProjectMembersType } from "@/data/project/get-project-members";
import slugify from "slugify";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { cn } from "@/lib/utils";
import { editSubTask } from "@/actions/task/update-subTask";
import { getStatusColors, getStatusLabel } from "@/lib/colors/status-colors";
import { Badge } from "@/components/ui/badge";
import { useReloadView } from "@/hooks/use-reload-view";
import { parseIST } from "@/lib/utils";

type SubTaskBase = {
    id: string;
    name: string;
    description: string | null;
    taskSlug: string;
    tag: { id: string } | null;
    status: string | null;
    startDate: Date | string | null;
    dueDate: Date | string | null;
    days: number | null;
    assignee?: {
        id: string;
    } | null;
};

interface EditSubTaskFormProps<T extends SubTaskBase> {
    subTask: T;
    members: ProjectMembersType;
    projectId?: string; // Optional for workspace level
    parentTaskId?: string; // Optional for workspace level
    onSubTaskUpdated?: (updatedData: Partial<T>) => void;
    level?: "workspace" | "project"; // Explicitly define the level
    tags?: { id: string; name: string; }[]; // Dynamic tags
    projects?: { id: string; name: string; }[]; // For workspace-level project selection
    parentTasks?: { id: string; name: string; projectId: string; }[]; // For workspace-level parent task selection
}

export function EditSubTaskForm<T extends SubTaskBase>({
    subTask,
    members,
    projectId,
    parentTaskId,
    onSubTaskUpdated,
    level = "project", // Default to project level
    tags = [], // Default to empty array
    projects = [], // Default to empty array
    parentTasks = [], // Default to empty array
}: EditSubTaskFormProps<T>) {
    const [pending, startTransition] = useTransition();
    const [open, setOpen] = useState(false);
    const [selectedProjectId, setSelectedProjectId] = useState<string>(projectId || "");
    const router = useRouter();
    const reloadView = useReloadView();

    // Memoize filtered parent tasks to prevent infinite loops
    const filteredParentTasks = useMemo(() => {
        if (level === "workspace" && selectedProjectId) {
            return parentTasks.filter(task => task.projectId === selectedProjectId);
        }
        return parentTasks;
    }, [level, selectedProjectId, parentTasks]);

    const form = useForm<SubTaskSchemaType>({
        resolver: zodResolver(subTaskSchema) as unknown as Resolver<SubTaskSchemaType>,
        defaultValues: {
            name: subTask.name,
            description: subTask.description || "",
            taskSlug: subTask.taskSlug || "placeholder-slug",
            projectId: projectId,
            parentTaskId: parentTaskId,
            assignee: subTask.assignee?.id || "",
            tag: subTask.tag?.id || tags[0]?.id || "",
            status: (subTask.status || "TO_DO") as "TO_DO" | "IN_PROGRESS" | "CANCELLED" | "REVIEW" | "HOLD" | "COMPLETED",
            startDate: subTask.startDate ? (() => {
                const d = new Date(subTask.startDate);
                const year = d.getFullYear();
                const month = String(d.getMonth() + 1).padStart(2, '0');
                const day = String(d.getDate()).padStart(2, '0');
                const hours = String(d.getHours()).padStart(2, '0');
                const minutes = String(d.getMinutes()).padStart(2, '0');
                return `${year}-${month}-${day}T${hours}:${minutes}`;
            })() : "",
            dueDate: (subTask as any).dueDate ? (() => {
                const d = new Date((subTask as any).dueDate);
                const year = d.getFullYear();
                const month = String(d.getMonth() + 1).padStart(2, '0');
                const day = String(d.getDate()).padStart(2, '0');
                const hours = String(d.getHours()).padStart(2, '0');
                const minutes = String(d.getMinutes()).padStart(2, '0');
                return `${year}-${month}-${day}T${hours}:${minutes}`;
            })() : "",
        },
    });

    const watchedName = useWatch({
        control: form.control,
        name: "name",
    });

    const watchedTaskSlug = useWatch({
        control: form.control,
        name: "taskSlug",
    });

    useEffect(() => {
        if (watchedName) {
            const newSlug = slugify(watchedName, { lower: true, strict: true });
            form.setValue('taskSlug', newSlug, { shouldDirty: true, shouldValidate: true });
        }
    }, [watchedName, form]);



    function onSubmit(values: SubTaskSchemaType) {
        // Check if there are any actual changes
        const hasChanges =
            values.name !== subTask.name ||
            values.status !== (subTask.status || "TO_DO") ||
            values.assignee !== (subTask.assignee?.id || "") ||
            values.tag !== (subTask.tag?.id || "") ||
            values.startDate !== (subTask.startDate ? (() => {
                const d = new Date(subTask.startDate);
                const year = d.getFullYear();
                const month = String(d.getMonth() + 1).padStart(2, '0');
                const day = String(d.getDate()).padStart(2, '0');
                const hours = String(d.getHours()).padStart(2, '0');
                const minutes = String(d.getMinutes()).padStart(2, '0');
                return `${year}-${month}-${day}T${hours}:${minutes}`;
            })() : "") ||
            values.dueDate !== ((subTask as any).dueDate ? (() => {
                const d = new Date((subTask as any).dueDate);
                const year = d.getFullYear();
                const month = String(d.getMonth() + 1).padStart(2, '0');
                const day = String(d.getDate()).padStart(2, '0');
                const hours = String(d.getHours()).padStart(2, '0');
                const minutes = String(d.getMinutes()).padStart(2, '0');
                return `${year}-${month}-${day}T${hours}:${minutes}`;
            })() : "");

        if (!hasChanges) {
            toast.info("No changes detected");
            setOpen(false);
            return;
        }

        startTransition(async () => {
            const { data: result, error } = await tryCatch(editSubTask(values, subTask.id));

            if (error) {
                toast.error(error.message);
                console.error(error);
                return;
            }

            if (result.status === "success") {
                toast.success(result.message);

                if (onSubTaskUpdated) {
                    onSubTaskUpdated({
                        name: values.name,
                        description: values.description,
                        tag: values.tag,
                        startDate: values.startDate ? parseIST(values.startDate) : null,
                        dueDate: values.dueDate ? parseIST(values.dueDate) : null,
                    } as Partial<T>);
                }

                setOpen(false);

                // Reload all views to show the updated subtask
                reloadView();
            } else {
                toast.error(result.message);
            }
        });
    }

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <Button variant="ghost" size="sm" className="w-full justify-start">
                    <Pencil className="mr-2 h-4 w-4" />
                    Edit SubTask
                </Button>
            </DialogTrigger>
            <DialogContent className="max-h-[98vh] w-[min(900px,95vw)] overflow-hidden">
                <DialogHeader>
                    <DialogTitle>Edit SubTask</DialogTitle>
                </DialogHeader>

                <div className="mt-4 overflow-y-auto px-2 py-1 max-h-[70vh] thin-scrollbar">
                    <Form {...form}>
                        <form
                            onSubmit={form.handleSubmit(onSubmit, (error) => {
                                console.error(error);
                                toast.error("Failed to update subtask");
                            })}
                            className="space-y-5"
                        >
                            {/* SubTask Name */}
                            <FormField
                                control={form.control}
                                name="name"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>SubTask Name</FormLabel>
                                        <FormControl>
                                            <Input placeholder="Enter subtask name" {...field} />
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
                                            <FormLabel>Project *</FormLabel>
                                            <Select
                                                onValueChange={(value) => {
                                                    field.onChange(value);
                                                    setSelectedProjectId(value);
                                                }}
                                                value={field.value}
                                            >
                                                <FormControl>
                                                    <SelectTrigger>
                                                        <SelectValue placeholder="Select a project" />
                                                    </SelectTrigger>
                                                </FormControl>
                                                <SelectContent>
                                                    {projects.map((project) => (
                                                        <SelectItem key={project.id} value={project.id}>
                                                            {project.name}
                                                        </SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                            <FormDescription>
                                                Change the project for this subtask
                                            </FormDescription>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                            )}

                            {/* Parent Task Selection - Only for workspace level */}
                            {level === "workspace" && filteredParentTasks.length > 0 && (
                                <FormField
                                    control={form.control}
                                    name="parentTaskId"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>Parent Task *</FormLabel>
                                            <Select
                                                onValueChange={field.onChange}
                                                value={field.value}
                                                disabled={!selectedProjectId}
                                            >
                                                <FormControl>
                                                    <SelectTrigger>
                                                        <SelectValue placeholder={selectedProjectId ? "Select a parent task" : "Select a project first"} />
                                                    </SelectTrigger>
                                                </FormControl>
                                                <SelectContent>
                                                    {filteredParentTasks.map((task) => (
                                                        <SelectItem key={task.id} value={task.id}>
                                                            {task.name}
                                                        </SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                            <FormDescription>
                                                {selectedProjectId
                                                    ? "Change the parent task for this subtask"
                                                    : "Please select a project first"}
                                            </FormDescription>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                            )}

                            {/* Description */}
                            <FormField
                                control={form.control}
                                name="description"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Description</FormLabel>
                                        <FormControl>
                                            <Textarea
                                                {...field}
                                                placeholder="SubTask description"
                                                className="resize-none"
                                                rows={4}
                                            />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />

                            {/* Tag Selection */}
                            <FormField
                                control={form.control}
                                name="tag"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Tag</FormLabel>
                                        {tags.length > 0 ? (
                                            <div className="flex flex-wrap gap-2">
                                                {tags.map((tag) => (
                                                    <div
                                                        key={tag.id}
                                                        className={cn(
                                                            "flex flex-row items-center gap-2 cursor-pointer px-3 py-1.5 rounded-full border-2 transition-all",
                                                            field.value === tag.id
                                                                ? "border-primary bg-primary/10"
                                                                : "border-muted hover:border-primary/50"
                                                        )}
                                                        onClick={() => field.onChange(tag.id)}
                                                    >
                                                        <span className="text-xs font-normal">{tag.name}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        ) : (
                                            <p className="text-sm text-muted-foreground">No tags available. Create tags in workspace settings.</p>
                                        )}
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />

                            {/* Date and Duration */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <FormField
                                    control={form.control}
                                    name="startDate"
                                    render={({ field }) => (
                                        <FormItem >
                                        <FormLabel>Start Date</FormLabel>
                                        <FormControl>
                                            <Input type="datetime-local" {...field} />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                    )}
                                />

                                <FormField
                                    control={form.control}
                                    name="dueDate"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>Due Date</FormLabel>
                                            <FormControl>
                                                <Input type="datetime-local" {...field} />
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                            </div>

                            {/* Status (Read-only) */}
                            <FormField
                                control={form.control}
                                name="status"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Status</FormLabel>
                                        <div className="flex items-center gap-2">
                                            <Badge
                                                variant="outline"
                                                className={cn(
                                                    "text-sm font-medium px-3 py-1",
                                                    getStatusColors(field.value).color,
                                                    getStatusColors(field.value).bgColor,
                                                    getStatusColors(field.value).borderColor
                                                )}
                                            >
                                                {getStatusLabel(field.value)}
                                            </Badge>
                                            <span className="text-xs text-muted-foreground">
                                                (Change status in Kanban view)
                                            </span>
                                        </div>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />

                            {/* Assignee */}
                            <FormField
                                control={form.control}
                                name="assignee"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Assignee</FormLabel>
                                        <FormDescription className="text-xs text-muted-foreground mb-2">
                                            Select the assignee (only one allowed).
                                        </FormDescription>
                                        <div className="space-y-2">
                                            <Popover>
                                                <PopoverTrigger asChild>
                                                    <Button variant="outline" className="w-full justify-between font-normal">
                                                        {field.value
                                                            ? (() => {
                                                                const m = members?.find((m) => m.userId === field.value);
                                                                return `${m?.user.surname}`;
                                                            })()
                                                            : "Select assignee"}
                                                    </Button>
                                                </PopoverTrigger>

                                                <PopoverContent className="p-0 w-64">
                                                    <Command>
                                                        <CommandInput placeholder="Search members…" />
                                                        <CommandList>
                                                            <CommandEmpty>No members found.</CommandEmpty>
                                                            <CommandGroup>
                                                            {members?.filter((member) => {
                                                                    const role = member.projectRole;
                                                                    return role !== "VIEWER" && role !== "PROJECT_MANAGER";
                                                                }).map((member) => {
                                                                    const user = member.user;
                                                                    const userName = `${user.surname}`;
                                                                    const userId = user.id;
                                                                    const isSelected = field.value === userId;

                                                                    return (
                                                                        <CommandItem
                                                                            key={userId}
                                                                            value={userName}
                                                                            onSelect={() => {
                                                                                field.onChange(userId);
                                                                            }}
                                                                        >
                                                                            <Check
                                                                                className={cn(
                                                                                    "mr-2 h-4 w-4",
                                                                                    isSelected ? "opacity-100" : "opacity-0"
                                                                                )}
                                                                            />
                                                                            {userName}
                                                                        </CommandItem>
                                                                    );
                                                                })}
                                                            </CommandGroup>
                                                        </CommandList>
                                                    </Command>
                                                </PopoverContent>
                                            </Popover>
                                        </div>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />

                            {/* Submit Button */}
                            <div className="flex justify-end items-center gap-4 pt-2 mb-2">
                                <Button type="submit" disabled={pending}>
                                    {pending ? (
                                        <>
                                            Updating...
                                            <Loader2 className="ml-1 h-4 w-4 animate-spin" />
                                        </>
                                    ) : (
                                        <>
                                            Update SubTask
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
