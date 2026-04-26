"use client";

import { useState, useTransition, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { X, Check, Loader2 } from "lucide-react";
import { apiClient, type ApiResponse } from "@/lib/api-client";
import { tryCatch } from "@/hooks/try-catch";
import { toast } from "sonner";
import slugify from "slugify";
import { TableCell, TableRow } from "@/components/ui/table";
import { ProjectMembersType } from "@/types/project";
import { projectsClient } from "@/lib/api-client/projects";
import { SubTaskStatus, STATUS_OPTIONS, subTaskSchema } from "@/lib/zodSchemas";
import { getStatusColors } from "@/lib/colors/status-colors";
import { ColumnVisibility } from "../shared/column-visibility";
import { SubTaskType } from "@/data/task";
import { ProjectReviewer } from "@/actions/project/get-project-reviewers";
import { cn, parseIST } from "@/lib/utils";
import { DateTimePicker } from "@/components/ui/date-picker";

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
    const [reviewer, setReviewer] = useState(subTask?.reviewer?.id || "");
    const [reviewers, setReviewers] = useState<ProjectReviewer[]>([]);
    const [status, setStatus] = useState<typeof SubTaskStatus[number]>(
        (subTask?.status as typeof SubTaskStatus[number]) || "TO_DO"
    );
    const [startDate, setStartDate] = useState(
        subTask?.startDate ? (() => {
            const d = new Date(subTask.startDate);
            const year = d.getFullYear();
            const month = String(d.getMonth() + 1).padStart(2, '0');
            const day = String(d.getDate()).padStart(2, '0');
            const hours = String(d.getHours()).padStart(2, '0');
            const minutes = String(d.getMinutes()).padStart(2, '0');
            return `${year}-${month}-${day}T${hours}:${minutes}`;
        })() : (() => {
            const now = new Date(Date.now() + 10 * 60000);
            const year = now.getFullYear();
            const month = String(now.getMonth() + 1).padStart(2, '0');
            const day = String(now.getDate()).padStart(2, '0');
            const hours = String(now.getHours()).padStart(2, '0');
            const minutes = String(now.getMinutes()).padStart(2, '0');
            return `${year}-${month}-${day}T${hours}:${minutes}`;
        })()
    );
    const [dueDate, setDueDate] = useState(
        (subTask as any)?.dueDate ? (() => {
            const d = new Date((subTask as any).dueDate);
            const year = d.getFullYear();
            const month = String(d.getMonth() + 1).padStart(2, '0');
            const day = String(d.getDate()).padStart(2, '0');
            const hours = String(d.getHours()).padStart(2, '0');
            const minutes = String(d.getMinutes()).padStart(2, '0');
            return `${year}-${month}-${day}T${hours}:${minutes}`;
        })() : (() => {
            const now = new Date(Date.now() + 30 * 60000);
            const year = now.getFullYear();
            const month = String(now.getMonth() + 1).padStart(2, '0');
            const day = String(now.getDate()).padStart(2, '0');
            const hours = String(now.getHours()).padStart(2, '0');
            const minutes = String(now.getMinutes()).padStart(2, '0');
            return `${year}-${month}-${day}T${hours}:${minutes}`;
        })()
    );
    const [tagIds, setTagIds] = useState<string[]>(subTask?.tags?.map(t => t.id) || []);
    const [days, setDays] = useState<number>(subTask?.days || 1);

    const handleStartDateChange = (val: string) => {
        setStartDate(val);
        if (val && days) {
            const start = parseIST(val);
            if (start) {
                const due = new Date(start.getTime() + days * 24 * 60 * 60 * 1000);
                const year = due.getFullYear();
                const month = String(due.getMonth() + 1).padStart(2, '0');
                const day = String(due.getDate()).padStart(2, '0');
                const hours = String(due.getHours()).padStart(2, '0');
                const minutes = String(due.getMinutes()).padStart(2, '0');
                setDueDate(`${year}-${month}-${day}T${hours}:${minutes}`);
            }
        }
    };

    const handleDueDateChange = (val: string) => {
        setDueDate(val);
        if (startDate && val) {
            const start = parseIST(startDate);
            const due = parseIST(val);
            if (start && due) {
                const diffTime = due.getTime() - start.getTime();
                const calculatedDays = Math.max(1, Math.round(diffTime / (1000 * 60 * 60 * 24)));
                setDays(calculatedDays);
            }
        }
    };

    const handleDaysChange = (val: number) => {
        setDays(val);
        if (startDate && val) {
            const start = parseIST(startDate);
            if (start) {
                const due = new Date(start.getTime() + val * 24 * 60 * 60 * 1000);
                const year = due.getFullYear();
                const month = String(due.getMonth() + 1).padStart(2, '0');
                const day = String(due.getDate()).padStart(2, '0');
                const hours = String(due.getHours()).padStart(2, '0');
                const minutes = String(due.getMinutes()).padStart(2, '0');
                setDueDate(`${year}-${month}-${day}T${hours}:${minutes}`);
            }
        }
    };

    const [availableMembers, setAvailableMembers] = useState<ProjectMembersType>(members);

    // Fetch project members for this specific project (to fix global view scope)
    useEffect(() => {
        const fetchMembers = async () => {
            if (projectId) {
                try {
                    // Fetch real project members and filter out viewers
                    const pMembers = await projectsClient.getMembers(projectId);
                    if (pMembers && pMembers.length > 0) {
                        setAvailableMembers(pMembers.filter(m => m.projectRole !== "VIEWER"));
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
                if (!projectId) return;
                const fetchedReviewers = await projectsClient.getReviewers(projectId);
                setReviewers(fetchedReviewers);

                // For create mode, set current user as default reviewer if they're eligible
                if (mode === "create" && !reviewer && userId) {
                    const isReviewerEligible = (fetchedReviewers as ProjectReviewer[]).some(r => r.id === userId);
                    if (isReviewerEligible) {
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
        if (pending) return;

        const taskSlug = mode === "create"
            ? slugify(subTaskName.trim(), { lower: true, strict: true })
            : (subTask?.taskSlug || "");

        // Collect form data for validation
        const formData = {
            name: subTaskName.trim(),
            description: description.trim() || undefined,
            taskSlug,
            status,
            projectId,
            parentTaskId,
            assignee: assignee,
            reviewerId: reviewer || undefined,
            tagIds: tagIds,
            startDate: startDate || undefined,
            dueDate: dueDate,
            days: days,
        };

        // Use zod for robust validation
        const validation = subTaskSchema.safeParse(formData);

        if (!validation.success) {
            // Display only the first validation error message
            const errorMessage = validation.error.issues[0]?.message || "Validation failed";
            toast.error(errorMessage);
            return;
        }

        const validData = validation.data;

        // Helper to get full objects for optimistic UI
        const selectedMember = members.find(m => m.userId === assignee);
        const selectedTags = tags.filter(t => tagIds.includes(t.id));

        if (mode === "create") {
            // CREATE MODE
            // LEVEL 1: Optimistic UI Update for Creation
            const tempId = `temp-${Date.now()}`;
            const optimisticSubTask = {
                id: tempId,
                name: validData.name,
                description: validData.description,
                status: validData.status,
                startDate: validData.startDate ? parseIST(validData.startDate) : null,
                dueDate: validData.dueDate ? parseIST(validData.dueDate) : null,
                days: validData.days,
                projectId,
                parentTaskId,
                createdAt: new Date(),
                updatedAt: new Date(),
                isOptimistic: true,
                subtaskCount: 0,
                completedSubtaskCount: 0,
                _count: { activities: 0 },
                // Include full objects for UI
                assignee: selectedMember ? {
                    id: selectedMember.userId,
                    surname: selectedMember.user.surname,
                } as any : null,
                tags: selectedTags.map(t => ({ id: t.id, name: t.name }))
            };

            onSubTaskCreated?.(optimisticSubTask, tempId);
            setSubTaskName("");
            onCancel();

            startTransition(async () => {
                const { data: result, error } = await tryCatch(
                    apiClient.tasks.createSubTask(validData)
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
                name: validData.name,
                description: validData.description,
                status: validData.status,
                startDate: validData.startDate ? parseIST(validData.startDate) : null,
                dueDate: validData.dueDate ? parseIST(validData.dueDate) : null,
                days: validData.days,
                // Include full objects for UI
                assignee: selectedMember ? {
                    id: selectedMember.userId,
                    surname: selectedMember.user.surname,
                } as any : null,
                tags: selectedTags.map(t => ({ id: t.id, name: t.name })) as any
            };

            if (onSubTaskUpdated) {
                onSubTaskUpdated(subTask.id, updatedData);
            }
            onCancel();

            startTransition(async () => {
                const res = await tryCatch(
                    apiClient.tasks.updateTask(subTask.id, workspaceId, projectId, validData)
                );

                if (res.error) {
                    toast.error(res.error.message || "Failed to update subtask");
                    return;
                }

                // Defensive casting to overcome module resolution issues
                const response = res.data as ApiResponse;
                const { status: responseStatus, message: responseMessage } = response;

                if (responseStatus !== "success") {
                    toast.error(responseMessage || "Failed to update subtask");
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
            {/* Drag Handle - Empty with hierarchy gap */}
            <TableCell className="w-[50px] sticky left-0 z-20 bg-background">
                <div className="flex items-center">
                    <div className="w-8 shrink-0" />
                </div>
            </TableCell>

            {/* SubTask Name Input */}
            <TableCell className="w-[80px] sm:w-[120px] md:w-[220px] sticky left-[50px] z-20 bg-background pl-0">
                <div className="flex flex-col">
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
                    {subTaskName.trim().length > 0 && (
                        <p className="text-[10px] text-muted-foreground mt-0.5 px-1">
                            Slug: <span className="font-mono">{slugify(subTaskName.trim(), { lower: true, strict: true })}</span>
                        </p>
                    )}
                </div>
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
                            {availableMembers
                                .filter(m => m.projectRole !== "VIEWER")
                                .map((member) => (
                                    <SelectItem key={member.userId} value={member.userId}>
                                        <span className="truncate block">
                                            {member.user.surname || member.user.name}
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
                                        {rev.surname} ({getRoleShortcut(rev.role)})
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
                            {STATUS_OPTIONS.map((option) => {
                                const statusColors = getStatusColors(option.value);
                                const hexMatch = statusColors?.bgColor?.match(/#([A-Fa-f0-9]{6})/);
                                const hex = hexMatch ? `#${hexMatch[1]}` : undefined;

                                return (
                                    <SelectItem key={option.value} value={option.value}>
                                        <div className="flex items-center gap-2">
                                            {hex ? (
                                                <div
                                                    className="h-2 w-2 rounded-full border border-black/5 dark:border-white/10"
                                                    style={{ backgroundColor: hex }}
                                                />
                                            ) : (
                                                <div className={cn(
                                                    "h-2 w-2 rounded-full",
                                                    statusColors?.color?.replace("text-", "bg-") || "bg-slate-400"
                                                )} />
                                            )}
                                            {option.label}
                                        </div>
                                    </SelectItem>
                                );
                            })}
                        </SelectContent>
                    </Select>
                </TableCell>
            )}

            {/* Start Date */}
            {columnVisibility.startDate && (
                <TableCell className="w-[120px]">
                    <DateTimePicker
                        value={startDate}
                        onChange={handleStartDateChange}
                        disabled={pending}
                    />
                </TableCell>
            )}

            {/* Deadline */}
            {columnVisibility.dueDate && (
                <TableCell className="w-[120px]">
                    <DateTimePicker
                        value={dueDate}
                        onChange={handleDueDateChange}
                        disabled={pending}
                    />
                </TableCell>
            )}

            {/* Days Column (Replaces Progress for better UX) */}
            {columnVisibility.progress && (
                <TableCell className="w-[80px] px-2">
                    <Input
                        type="number"
                        min={1}
                        max={365}
                        value={days}
                        onChange={(e) => {
                            const val = parseInt(e.target.value);
                            if (!isNaN(val)) {
                                handleDaysChange(Math.max(1, Math.min(365, val)));
                            }
                        }}
                        disabled={pending}
                        className="h-8 border-primary/30"
                        placeholder="Days"
                    />
                </TableCell>
            )}

            {/* Tag Selection - Multi Select with Popover */}
            {columnVisibility.tag && (
                <TableCell className="w-[120px] max-w-[120px]">
                    <Popover>
                        <PopoverTrigger asChild>
                            <Button
                                variant="outline"
                                size="sm"
                                className="h-8 w-full justify-start text-xs font-normal px-2 overflow-hidden"
                                disabled={pending}
                            >
                                <div className="flex gap-1 truncate items-center">
                                    {tagIds.length > 0 ? (
                                        <div className="flex -space-x-1 overflow-hidden">
                                            {tagIds.slice(0, 2).map((id) => (
                                                <div
                                                    key={id}
                                                    className="h-4 w-4 rounded-full border border-background bg-primary/20 flex items-center justify-center text-[10px]"
                                                    title={tags.find(t => t.id === id)?.name}
                                                >
                                                    {tags.find(t => t.id === id)?.name.charAt(0)}
                                                </div>
                                            ))}
                                            {tagIds.length > 2 && (
                                                <div className="h-4 w-4 rounded-full border border-background bg-muted flex items-center justify-center text-[8px]">
                                                    +{tagIds.length - 2}
                                                </div>
                                            )}
                                        </div>
                                    ) : (
                                        <span className="text-muted-foreground truncate">Tags...</span>
                                    )}
                                </div>
                            </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-[200px] p-2" align="start">
                            <div className="space-y-1">
                                <p className="text-[10px] font-medium text-muted-foreground uppercase px-1 mb-2">Select Tags</p>
                                <div className="max-h-[200px] overflow-y-auto space-y-0.5">
                                    {tags.map((t) => {
                                        const isSelected = tagIds.includes(t.id);
                                        return (
                                            <div
                                                key={t.id}
                                                className={cn(
                                                    "flex items-center gap-2 px-2 py-1.5 rounded-md cursor-pointer text-xs transition-colors",
                                                    isSelected ? "bg-primary/10 text-primary" : "hover:bg-muted"
                                                )}
                                                onClick={() => {
                                                    if (isSelected) {
                                                        setTagIds(tagIds.filter(id => id !== t.id));
                                                    } else {
                                                        setTagIds([...tagIds, t.id]);
                                                    }
                                                }}
                                            >
                                                <div className={cn(
                                                    "h-3 w-3 rounded-sm border flex items-center justify-center transition-colors",
                                                    isSelected ? "bg-primary border-primary" : "border-muted-foreground/30"
                                                )}>
                                                    {isSelected && <Check className="h-2 w-2 text-primary-foreground" />}
                                                </div>
                                                <span className="truncate">{t.name}</span>
                                            </div>
                                        );
                                    })}
                                    {tags.length === 0 && (
                                        <p className="text-[10px] text-muted-foreground px-1 py-4 text-center">No tags found</p>
                                    )}
                                </div>
                            </div>
                        </PopoverContent>
                    </Popover>
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
