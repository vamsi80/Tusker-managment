"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useState, useTransition } from "react";
import { Resolver, useForm } from "react-hook-form";
import { Check, Loader2, Pencil, PenTool, ShoppingCart, Hammer } from "lucide-react";
import { useRouter } from "next/navigation";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { subTaskSchema, SubTaskSchemaType } from "@/lib/zodSchemas";
import { tryCatch } from "@/hooks/try-catch";
import { toast } from "sonner";
import { FlatTaskType } from "@/data/task";
import { ProjectMembersType } from "@/data/project/get-project-members";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { cn } from "@/lib/utils";
import { editSubTask } from "@/actions/task/update-subTask";
import { getStatusColors, getStatusLabel } from "@/lib/colors/status-colors";
import { Badge } from "@/components/ui/badge";

interface EditSubTaskFormProps {
    subTask: FlatTaskType;
    members: ProjectMembersType;
    projectId: string;
    parentTaskId: string;
    onSubTaskUpdated?: (updatedData: Partial<FlatTaskType>) => void;
}

export function EditSubTaskForm({
    subTask,
    members,
    projectId,
    parentTaskId,
    onSubTaskUpdated,
}: EditSubTaskFormProps) {
    const [pending, startTransition] = useTransition();
    const [open, setOpen] = useState(false);
    const router = useRouter();

    const form = useForm<SubTaskSchemaType>({
        resolver: zodResolver(subTaskSchema) as unknown as Resolver<SubTaskSchemaType>,
        defaultValues: {
            name: subTask.name,
            description: subTask.description || "",
            taskSlug: subTask.taskSlug || "placeholder-slug",
            projectId: projectId,
            parentTaskId: parentTaskId,
            assignee: subTask.assignee?.workspaceMember?.user?.id || "",
            tag: subTask.tag || "CONTRACTOR",
            status: subTask.status || "TO_DO",
            startDate: subTask.startDate ? new Date(subTask.startDate).toISOString().split('T')[0] : "",
            days: subTask.days || 0,
        },
    });

    function onSubmit(values: SubTaskSchemaType) {
        // Check if there are any actual changes
        const hasChanges =
            values.name !== subTask.name ||
            values.description !== (subTask.description || "") ||
            values.assignee !== (subTask.assignee?.workspaceMember?.user?.id || "") ||
            values.tag !== subTask.tag ||
            values.startDate !== (subTask.startDate ? new Date(subTask.startDate).toISOString().split('T')[0] : "") ||
            values.days !== subTask.days;

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
                        startDate: values.startDate ? new Date(values.startDate) : null,
                        days: values.days,
                    });
                }

                setOpen(false);

                router.refresh();
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
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />

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
                                        <div className="flex gap-4">
                                            {[
                                                { value: "DESIGN", icon: PenTool, label: "Design" },
                                                { value: "PROCUREMENT", icon: ShoppingCart, label: "Procurement" },
                                                { value: "CONTRACTOR", icon: Hammer, label: "Contractor" },
                                            ].map((tag) => (
                                                <div
                                                    key={tag.value}
                                                    className={cn(
                                                        "flex flex-row items-center gap-2 cursor-pointer px-3 py-1 rounded-full border-2 transition-all",
                                                        field.value === tag.value
                                                            ? "border-primary bg-primary/10"
                                                            : "border-muted hover:border-primary/50"
                                                    )}
                                                    onClick={() => field.onChange(tag.value)}
                                                >
                                                    <tag.icon className="size-3" />
                                                    <span className="text-xs font-normal">{tag.label}</span>
                                                </div>
                                            ))}
                                        </div>
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
                                        <FormItem>
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
