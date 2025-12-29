"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { X, Check, Loader2 } from "lucide-react";
import { createSubTask } from "@/actions/task/create-subTask";
import { editSubTask } from "@/actions/task/update-subTask";
import { tryCatch } from "@/hooks/try-catch";
import { toast } from "sonner";
import slugify from "slugify";
import { TableCell, TableRow } from "@/components/ui/table";
import { ProjectMembersType } from "@/data/project/get-project-members";
import { SubTaskStatus, STATUS_OPTIONS } from "@/lib/zodSchemas";
import { ColumnVisibility } from "../shared/column-visibility";
import { SubTaskType } from "@/data/task/list/get-subtasks";
import { ApiResponse } from "@/lib/types";

interface InlineSubTaskFormProps {
    workspaceId: string;
    projectId: string;
    parentTaskId: string;
    members: ProjectMembersType;
    tags?: { id: string; name: string; }[];
    columnVisibility: ColumnVisibility;
    onCancel: () => void;
    onSubTaskCreated?: (subTask: any, tempId?: string) => void;
    onSubTaskUpdated?: (subTaskId: string, updatedData: Partial<SubTaskType>) => void;
    onSubTaskDeleted?: (subTaskId: string) => void;
    // Edit mode props
    mode?: "create" | "edit";
    subTask?: SubTaskType; // Required when mode is "edit"
}

/**
 * Unified inline subtask form for both create and edit modes
 * Similar to ClickUp's inline editing experience
 */
export function InlineSubTaskForm({
    workspaceId,
    projectId,
    parentTaskId,
    members,
    tags = [],
    columnVisibility,
    onCancel,
    onSubTaskCreated,
    onSubTaskUpdated,
    onSubTaskDeleted,
    mode = "create",
    subTask,
}: InlineSubTaskFormProps) {
    const [pending, startTransition] = useTransition();
    const [subTaskName, setSubTaskName] = useState(subTask?.name || "");
    const [description, setDescription] = useState(subTask?.description || "");
    const [assignee, setAssignee] = useState(subTask?.assignee?.workspaceMemberId || "");
    const [status, setStatus] = useState<typeof SubTaskStatus[number]>(subTask?.status || "TO_DO");
    const [startDate, setStartDate] = useState(
        subTask?.startDate ? new Date(subTask.startDate).toISOString().split('T')[0] : ""
    );
    const [days, setDays] = useState(String(subTask?.days || 0));
    const [tag, setTag] = useState(subTask?.tag?.id || "");

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!subTaskName.trim()) {
            toast.error("SubTask name is required");
            return;
        }

        if (subTaskName.trim().length < 3) {
            toast.error("SubTask name must be at least 3 characters long");
            return;
        }

        if (mode === "create") {
            // CREATE MODE
            const taskSlug = slugify(subTaskName.trim(), { lower: true, strict: true });

            if (taskSlug.length < 3) {
                toast.error("SubTask name must generate a valid slug (at least 3 characters)");
                return;
            }

            // LEVEL 1: Optimistic UI Update for Creation
            const tempId = `temp-${Date.now()}`;
            const optimisticSubTask = {
                id: tempId,
                name: subTaskName.trim(),
                description: description.trim() || undefined,
                status,
                startDate: startDate ? new Date(startDate) : null,
                days: parseInt(days) || 0,
                projectId,
                parentTaskId,
                createdAt: new Date(),
                updatedAt: new Date(),
                isOptimistic: true, // Tag for potential UI treatment
                _count: { reviewComments: 0 }
            };

            onSubTaskCreated?.(optimisticSubTask);
            setSubTaskName(""); // Clear name but keep form open or close? 
            // In ClickUp, creating often Keeps the form open for the next one.
            // But currently onCancel closes it. Let's keep existing flow for now.
            onCancel();

            startTransition(async () => {
                const { data: result, error } = await tryCatch(
                    createSubTask({
                        name: subTaskName.trim(),
                        description: description.trim() || undefined,
                        taskSlug: taskSlug,
                        projectId,
                        parentTaskId,
                        status,
                        assignee: assignee || undefined,
                        startDate: startDate || undefined,
                        days: parseInt(days) || 0,
                        tag: tag || undefined,
                    })
                );

                if (error || (result as ApiResponse).status !== "success") {
                    toast.error(error?.message || (result as ApiResponse).message || "Failed to create subtask");
                    // ROLLBACK: Remove the optimistic item from TaskTable
                    if (onSubTaskDeleted) {
                        onSubTaskDeleted(tempId);
                    }
                    return;
                }

                const apiResult = result as ApiResponse;
                toast.success("Subtask created");

                // Replace the optimistic subtask with the real one in the parent state
                // This is handled in TaskTable if we pass the tempId for replacement
                onSubTaskCreated?.(apiResult.data, tempId);
            });
        } else {
            // EDIT MODE
            if (!subTask) {
                toast.error("SubTask data is missing");
                return;
            }

            // LEVEL 1: Optimistic UI Update
            // Update UI immediately before server call
            const updatedData: Partial<SubTaskType> = {
                name: subTaskName.trim(),
                description: description.trim() || undefined,
                status,
                startDate: startDate ? new Date(startDate) : null,
                days: parseInt(days) || 0,
            };

            if (onSubTaskUpdated) {
                onSubTaskUpdated(subTask.id, updatedData);
            }
            onCancel(); // Close form immediately

            startTransition(async () => {
                const { data: result, error } = await tryCatch(
                    editSubTask({
                        name: subTaskName.trim(),
                        description: description.trim() || undefined,
                        taskSlug: subTask.taskSlug,
                        projectId: subTask.projectId,
                        parentTaskId: subTask.parentTaskId || "",
                        status,
                        assignee: assignee || undefined,
                        startDate: startDate || undefined,
                        days: parseInt(days) || 0,
                        tag: tag || undefined,
                    }, subTask.id)
                );

                if (error || result.status !== "success") {
                    toast.error(error?.message || result?.message || "Failed to update subtask");
                    // NOTE: In a full-pledge production app, you would roll back the UI state here.
                    // For now, the user is notified of the failure.
                    return;
                }

                toast.success("Subtask saved");
            });
        }
    };

    return (
        <TableRow className={mode === "edit" ? "bg-primary/5 hover:bg-primary/10" : "bg-muted/20 hover:bg-muted/30"}>
            {/* Drag Handle - Empty */}
            <TableCell className="w-[50px]"></TableCell>

            {/* SubTask Name Input */}
            <TableCell className="min-w-[250px] pl-0">
                <Input
                    placeholder="SubTask name..."
                    value={subTaskName}
                    onChange={(e) => setSubTaskName(e.target.value)}
                    onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                            e.preventDefault();
                            handleSubmit(e);
                        }
                        if (e.key === "Escape") {
                            onCancel();
                        }
                    }}
                    autoFocus
                    disabled={pending}
                    className="h-8 border-primary/50 focus-visible:ring-primary"
                />
            </TableCell>

            {/* Description - Popover with Textarea */}
            {columnVisibility.description && (
                <TableCell className="w-[200px]">
                    <Popover>
                        <PopoverTrigger asChild>
                            <Button
                                variant="outline"
                                className="h-8 w-full justify-start text-left font-normal"
                                disabled={pending}
                            >
                                <span className={description ? "text-foreground" : "text-muted-foreground"}>
                                    {description || "Add description..."}
                                </span>
                            </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-80" align="start">
                            <div className="space-y-2">
                                <h4 className="font-medium text-sm">Description</h4>
                                <Textarea
                                    placeholder="Enter description..."
                                    value={description}
                                    onChange={(e) => setDescription(e.target.value)}
                                    disabled={pending}
                                    className="min-h-[100px] resize-none"
                                    autoFocus
                                />
                            </div>
                        </PopoverContent>
                    </Popover>
                </TableCell>
            )}

            {/* Assignee */}
            {columnVisibility.assignee && (
                <TableCell className="w-[200px]">
                    <Select value={assignee} onValueChange={setAssignee} disabled={pending}>
                        <SelectTrigger className="h-8">
                            <SelectValue placeholder="Select assignee..." />
                        </SelectTrigger>
                        <SelectContent>
                            {members.map((member) => (
                                <SelectItem key={member.workspaceMember.id} value={member.workspaceMember.id}>
                                    {member.workspaceMember.user.name} {member.workspaceMember.user.surname}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </TableCell>
            )}

            {/* Status */}
            {columnVisibility.status && (
                <TableCell className="w-[120px]">
                    <Select value={status} onValueChange={(value) => setStatus(value as typeof SubTaskStatus[number])} disabled={pending}>
                        <SelectTrigger className="h-8">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            {STATUS_OPTIONS.map((option) => (
                                <SelectItem key={option.value} value={option.value}>
                                    {option.label}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </TableCell>
            )}

            {/* Start Date */}
            {columnVisibility.startDate && (
                <TableCell className="w-[150px]">
                    <Input
                        type="date"
                        value={startDate}
                        onChange={(e) => setStartDate(e.target.value)}
                        disabled={pending}
                        className="h-8"
                    />
                </TableCell>
            )}

            {/* Days (for due date calculation) */}
            {columnVisibility.dueDate && (
                <TableCell className="w-[150px]">
                    <Input
                        type="number"
                        placeholder="Days..."
                        value={days}
                        onChange={(e) => setDays(e.target.value)}
                        disabled={pending}
                        className="h-8"
                        min="0"
                    />
                </TableCell>
            )}

            {/* Progress - Empty (calculated field) */}
            {columnVisibility.progress && (
                <TableCell className="w-[120px]"></TableCell>
            )}

            {/* Tag */}
            {columnVisibility.tag && (
                <TableCell className="w-[150px]">
                    <Select value={tag} onValueChange={setTag} disabled={pending}>
                        <SelectTrigger className="h-8">
                            <SelectValue placeholder="Select tag..." />
                        </SelectTrigger>
                        <SelectContent>
                            {tags.map((t) => (
                                <SelectItem key={t.id} value={t.id}>
                                    {t.name}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </TableCell>
            )}

            {/* Action Buttons */}
            <TableCell className="w-[50px]">
                <div className="flex items-center gap-1">
                    <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 w-7 p-0 hover:bg-green-100 hover:text-green-600"
                        onClick={handleSubmit}
                        disabled={pending || subTaskName.trim().length < 3}
                    >
                        {pending ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                            <Check className="h-4 w-4" />
                        )}
                    </Button>
                    <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 w-7 p-0 hover:bg-red-100 hover:text-red-600"
                        onClick={onCancel}
                        disabled={pending}
                    >
                        <X className="h-4 w-4" />
                    </Button>
                </div>
            </TableCell>
        </TableRow>
    );
}
