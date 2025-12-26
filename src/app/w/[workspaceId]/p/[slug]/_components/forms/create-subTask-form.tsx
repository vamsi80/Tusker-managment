"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useTransition, useState, useEffect } from "react";
import { Resolver, useForm } from "react-hook-form";
import { Check, Loader2, PlusIcon, SparkleIcon } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { subTaskSchema, SubTaskSchemaType } from "@/lib/zodSchemas";
import { tryCatch } from "@/hooks/try-catch";
import { useConfetti } from "@/hooks/use-confetti";
import { toast } from "sonner";
import { ProjectMembersType } from "@/data/project/get-project-members";
import slugify from "slugify";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { cn } from "@/lib/utils";
import { useRouter } from "next/navigation";
import { createSubTask } from "@/actions/task/create-subTask";
import { useReloadView } from "@/hooks/use-reload-view";

interface iAppProps {
    members: ProjectMembersType;
    workspaceId: string;
    projectId?: string; // Optional for workspace-level
    parentTaskId?: string; // Optional for workspace-level
    onSubTaskCreated?: (subTask: any) => void;
    level?: "workspace" | "project"; // Explicitly define the level
    tags?: { id: string; name: string; color: string; }[]; // Dynamic tags
}

export const CreateSubTaskForm = ({
    members,
    workspaceId,
    projectId,
    parentTaskId,
    onSubTaskCreated,
    level = "project", // Default to project level for backward compatibility
    tags = [], // Default to empty array
}: iAppProps) => {
    const [pending, startTransition] = useTransition();
    const { triggerConfetti } = useConfetti();
    const [open, setOpen] = useState(false);
    const [autoSlugEnabled, setAutoSlugEnabled] = useState(true);
    const router = useRouter();
    const reloadView = useReloadView();

    const form = useForm<SubTaskSchemaType>({
        resolver: zodResolver(subTaskSchema) as unknown as Resolver<SubTaskSchemaType>,
        defaultValues: {
            name: "",
            description: "",
            taskSlug: "",
            startDate: "",
            days: 0,
            assignee: "",
            status: "TO_DO",
            tag: tags[0]?.id || "", // Use first tag's ID or empty string
            projectId: projectId || "", // Use empty string if not provided
            parentTaskId: parentTaskId || "", // Use empty string if not provided
        },
    })

    // Auto-update slug when subtask name changes
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

    function onSubmit(data: SubTaskSchemaType) {
        startTransition(async () => {
            const { data: result, error } = await tryCatch(createSubTask(data));
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

                // Notify parent to add subtask to state immediately
                if (onSubTaskCreated && result.data) {
                    onSubTaskCreated(result.data);
                }

                // Reload all views to show the new subtask
                reloadView();
            } else (
                toast.error(result.message)
            )
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
                <Button size="sm">
                    <PlusIcon className="mr-2 size-4" />
                    {level === "workspace" ? "Create Task" : "Create Sub-Task"}
                </Button>
            </DialogTrigger>
            <DialogContent className="max-h-[98vh] w-[min(900px,95vw)] overflow-hidden">
                <DialogHeader>
                    <DialogTitle>
                        {level === "workspace" ? "Create New Task" : "Create New SubTask"}
                    </DialogTitle>
                </DialogHeader>

                <div className="mt-4 overflow-y-auto px-2 py-1 max-h-[70vh] thin-scrollbar">
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
                                        <FormLabel>{level === "workspace" ? "Task Name" : "SubTask Name"}</FormLabel>
                                        <FormControl>
                                            <Input placeholder={level === "workspace" ? "Enter task name" : "Enter subtask name"} {...field} />
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
                                                placeholder={level === "workspace" ? "Task description" : "SubTask description"}
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
                                                        style={{
                                                            backgroundColor: field.value === tag.id ? `${tag.color}20` : 'transparent',
                                                        }}
                                                    >
                                                        <div
                                                            className="size-3 rounded-full"
                                                            style={{ backgroundColor: tag.color }}
                                                        />
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
                                                <Input type="date" {...field} />
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />

                                <FormField
                                    control={form.control}
                                    name="days"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>Duration (Days)</FormLabel>
                                            <FormControl>
                                                <Input
                                                    type="number"
                                                    placeholder="Days"
                                                    {...field}
                                                    onChange={(e) => field.onChange(e.target.valueAsNumber || 0)}
                                                />
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />

                            </div>
                            <FormField
                                control={form.control}
                                name="status"
                                render={({ field }) => (
                                    <FormItem >
                                        <FormLabel>Status</FormLabel>
                                        <FormControl>
                                            <Input
                                                value="TO DO"
                                                disabled
                                                className="bg-muted cursor-not-allowed"
                                            />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />

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
                                                                const m = members?.find((m) => m.workspaceMember.user.id === field.value);
                                                                return `${m?.workspaceMember.user.surname || m?.workspaceMember.user.name}`;
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
                                                                    const role = member.workspaceMember.workspaceRole;
                                                                    return role !== "VIEWER" && role !== "ADMIN";
                                                                }).map((member) => {
                                                                    const user = member.workspaceMember.user;
                                                                    const userName = `${user.name} ${user.surname || ''}`;
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

                            <div className="flex justify-end items-center gap-4 pt-2 mb-2">
                                <Button type="submit" disabled={pending}>
                                    {pending ? (
                                        <>
                                            Creating...
                                            <Loader2 className="ml-1 h-4 w-4 animate-spin" />
                                        </>
                                    ) : (
                                        <>
                                            {level === "workspace" ? "Create Task" : "Create SubTask"}
                                            <PlusIcon className="ml-1" size={16} />
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
};
