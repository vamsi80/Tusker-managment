"use client";

import { useState, useTransition, useEffect } from "react";
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
import { ProjectMembersType, getProjectMembers } from "@/data/project/get-project-members";
import { SubTaskStatus, STATUS_OPTIONS } from "@/lib/zodSchemas";
import { ColumnVisibility } from "../shared/column-visibility";
import { SubTaskType } from "@/data/task/list/get-subtasks";
import { ApiResponse } from "@/lib/types";
import { getProjectReviewers, ProjectReviewer } from "@/actions/project/get-project-reviewers";
import { cn } from "@/lib/utils";

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
    userId?: string; // Current user ID for default reviewer
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
    userId,
}: InlineSubTaskFormProps) {
    const [pending, startTransition] = useTransition();
    const [subTaskName, setSubTaskName] = useState(subTask?.name || "");
    const [description, setDescription] = useState(subTask?.description || "");
    const [assignee, setAssignee] = useState(subTask?.assignee?.id || "");
    const [reviewer, setReviewer] = useState(subTask?.reviewerId || "");
    const [reviewers, setReviewers] = useState<ProjectReviewer[]>([]);
    const [status, setStatus] = useState<typeof SubTaskStatus[number]>(subTask?.status || "TO_DO");
    const [startDate, setStartDate] = useState(
        subTask?.startDate ? new Date(subTask.startDate).toISOString().split('T')[0] : ""
    );
    const [days, setDays] = useState(String(subTask?.days || 0));
    const [tag, setTag] = useState(subTask?.tag?.id || "");

    const [availableMembers, setAvailableMembers] = useState<ProjectMembersType>(members);

    // Fetch project members for this specific project (to fix global view scope)
    useEffect(() => {
        const fetchMembers = async () => {
            if (projectId) {
                try {
                    // Start with passed members as fallback or loading state
                    // Fetch real project members
                    const pMembers = await getProjectMembers(projectId);
                    if (pMembers && pMembers.length > 0) {
                        setAvailableMembers(pMembers);
                    }
                } catch (error) {
                    console.error("Failed to fetch project members", error);
                }
            }
        };
        fetchMembers();
    }, [projectId]);

    // Fetch reviewers and set default reviewer to current user when component mounts
    useEffect(() => {
        const fetchData = async () => {
            try {
                const fetchedReviewers = await getProjectReviewers(projectId);
                setReviewers(fetchedReviewers);

                // For create mode, set current user as default reviewer if they're eligible
                if (mode === "create" && !reviewer && userId) {
                    const isReviewer = fetchedReviewers.find(r => r.id === userId);
                    if (isReviewer) {
                        setReviewer(userId);
                    }
                }
            } catch (err) {
                console.error("Failed to fetch reviewers", err);
            }
        };

        fetchData();
    }, [projectId, mode, reviewer, userId]);

    // Helper function to get role shortcuts
    const getRoleShortcut = (role: string): string => {
        const shortcuts: Record<string, string> = {
            'PROJECT_MANAGER': 'PM',
            'LEAD': 'Lead',
            'OWNER': 'Owner',
            'ADMIN': 'Admin',
        };
        return shortcuts[role] || role;
    };

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

        // Helper to get full objects for optimistic UI
        const selectedMember = members.find(m => m.workspaceMember.userId === assignee);
        const selectedTag = tags.find(t => t.id === tag);

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
                isOptimistic: true,
                _count: { reviewComments: 0 },
                // Include full objects for UI
                assignee: selectedMember ? {
                    id: selectedMember.workspaceMember.userId,
                    name: selectedMember.workspaceMember.user.name,
                    surname: selectedMember.workspaceMember.user.surname,
                    image: selectedMember.workspaceMember.user.image,
                } : null,
                tag: selectedTag ? { id: selectedTag.id, name: selectedTag.name } : null
            };

            onSubTaskCreated?.(optimisticSubTask, tempId);
            setSubTaskName("");
            onCancel();

            startTransition(async () => {
                const { data: result, error } = await tryCatch(
                    createSubTask({
                        name: subTaskName.trim(),
                        taskSlug,
                        description: description.trim() || undefined,
                        status,
                        projectId,
                        parentTaskId,
                        assignee: assignee || undefined,
                        reviewerId: reviewer || undefined,
                        tag: tag || undefined,
                        startDate: startDate || undefined,
                        days: (days && Number(days) > 0) ? Number(days) : undefined,
                    })
                );

                if (error || (result as ApiResponse).status !== "success") {
                    toast.error(error?.message || (result as ApiResponse).message || "Failed to create subtask");
                    if (onSubTaskDeleted) {
                        onSubTaskDeleted(tempId);
                    }
                    return;
                }

                const apiResult = result as ApiResponse;
                toast.success("Subtask created");

                // Replace the optimistic subtask with the real one
                onSubTaskCreated?.(apiResult.data, tempId);
            });
        } else {
            // EDIT MODE
            if (!subTask) {
                toast.error("SubTask data is missing");
                return;
            }

            // LEVEL 1: Optimistic UI Update
            const updatedData: Partial<SubTaskType> = {
                name: subTaskName.trim(),
                description: description.trim() || undefined,
                status,
                startDate: startDate ? new Date(startDate) : null,
                days: parseInt(days) || 0,
                // Include full objects for UI
                assignee: selectedMember ? {
                    id: selectedMember.workspaceMember.userId,
                    name: selectedMember.workspaceMember.user.name,
                    surname: selectedMember.workspaceMember.user.surname,
                    image: selectedMember.workspaceMember.user.image,
                } as any : null,
                tag: selectedTag ? { id: selectedTag.id, name: selectedTag.name } as any : null
            };

            if (onSubTaskUpdated) {
                onSubTaskUpdated(subTask.id, updatedData);
            }
            onCancel();

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
                    return;
                }

                toast.success("Subtask saved");
            });
        }
    };

    return (
        <TableRow className={cn(
            mode === "edit" ? "bg-primary/5 hover:bg-primary/10" : "bg-muted/20 hover:bg-muted/30",
            "h-8 [&_td]:p-0"
        )}>
            {/* Drag Handle - Empty */}
            <TableCell className="w-[50px]"></TableCell>

            {/* SubTask Name Input */}
            <TableCell className="w-[250px] pl-0">
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
                                <span className={cn(
                                    "truncate block",
                                    description ? "text-foreground" : "text-muted-foreground"
                                )}>
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
                <TableCell className="w-[100px] max-w-[100px]">
                    <Select value={assignee} onValueChange={setAssignee} disabled={pending}>
                        <SelectTrigger className="h-8 w-full">
                            <SelectValue placeholder="Select assignee..." className="truncate" />
                        </SelectTrigger>
                        <SelectContent>
                            {availableMembers.map((member) => (
                                <SelectItem key={member.workspaceMember.userId} value={member.workspaceMember.userId}>
                                    <span className="truncate block">
                                        {member.workspaceMember.user.name} {member.workspaceMember.user.surname}
                                    </span>
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </TableCell>
            )}

            {/* Reviewer */}
            {columnVisibility.reviewer && (
                <TableCell className="w-[100px] max-w-[100px]">
                    <Select value={reviewer} onValueChange={setReviewer} disabled={pending}>
                        <SelectTrigger className="h-8 w-full">
                            <SelectValue placeholder="Select reviewer..." className="truncate" />
                        </SelectTrigger>
                        <SelectContent>
                            {reviewers.map((rev) => (
                                <SelectItem key={rev.id} value={rev.id}>
                                    <span className="truncate block">
                                        {rev.name} ({getRoleShortcut(rev.role)})
                                    </span>
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </TableCell>
            )}

            {/* Status */}
            {columnVisibility.status && (
                <TableCell className="w-[120px] max-w-[120px]">
                    <Select value={status} onValueChange={(value) => setStatus(value as typeof SubTaskStatus[number])} disabled={pending}>
                        <SelectTrigger className="h-8 w-full">
                            <SelectValue className="truncate" />
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
                <TableCell className="w-[120px]">
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
                <TableCell className="w-[120px]">
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
                <TableCell className="w-[120px] max-w-[120px]">
                    <Select value={tag} onValueChange={setTag} disabled={pending}>
                        <SelectTrigger className="h-8 w-full">
                            <SelectValue placeholder="Select tag..." className="truncate" />
                        </SelectTrigger>
                        <SelectContent>
                            {tags.map((t) => (
                                <SelectItem key={t.id} value={t.id}>
                                    <span className="truncate block">{t.name}</span>
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </TableCell>
            )}

            <TableCell className="w-[50px] px-0">
                <div className="flex items-center justify-center gap-0.5">
                    {subTaskName.trim().length >= 3 && (
                        <Button
                            size="icon"
                            variant="ghost"
                            className="h-6 w-6 hover:bg-green-100 hover:text-green-600"
                            onClick={handleSubmit}
                            disabled={pending}
                            title="Save (Enter)"
                        >
                            {pending ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                                <Check className="h-3.5 w-3.5" />
                            )}
                        </Button>
                    )}
                    <Button
                        size="icon"
                        variant="ghost"
                        className="h-6 w-6 hover:bg-red-100 hover:text-red-600"
                        onClick={onCancel}
                        disabled={pending}
                        title="Cancel (Esc)"
                    >
                        <X className="h-3.5 w-3.5" />
                    </Button>
                </div>
            </TableCell>
        </TableRow>
    );
}
