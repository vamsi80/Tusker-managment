"use client";

import { useState, useTransition } from "react";
import { Loader2, UserPlus, Check } from "lucide-react";
import { toast } from "sonner";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
    Command,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList,
} from "@/components/ui/command";
import { cn } from "@/lib/utils";
import { editSubTask } from "@/actions/task/update-subTask";
import type { ProjectMembersType } from "@/data/project/get-project-members";

// ─────────────────────────────────────────────────────────────────
// Minimal shape of a subtask that the picker needs.
// All three contexts (SubTaskType, KanbanSubTaskType, TaskByIdType)
// satisfy this shape.
// ─────────────────────────────────────────────────────────────────
export interface AssignableSubTask {
    id: string;
    name: string;
    description?: string | null;
    taskSlug: string;
    status?: string | null;
    startDate?: Date | string | null;
    dueDate?: Date | string | null;
    days?: number | null;
    projectId?: string;
    parentTaskId?: string | null;
    tag?: { id: string } | null;
    tagId?: string | null;
    assignee?: {
        id?: string;
        workspaceMember?: { user?: { id?: string } | null } | null;
    } | null;
    reviewer?: {
        id?: string;
        workspaceMember?: { user?: { id?: string } | null } | null;
    } | null;
}

interface InlineAssigneePickerProps {
    subTask: AssignableSubTask;
    members: ProjectMembersType;
    /** Optional: filter members by these IDs (e.g. only members of the current project) */
    allowedUserIds?: string[];
    projectId: string;
    parentTaskId: string;
    /** Whether the current user has permission to assign */
    canEdit: boolean;
    /** Fired on successful assignment: (userId, memberObj) */
    onAssigned: (userId: string, member: ProjectMembersType[number]) => void;
    /** Optional extra class for the trigger badge */
    className?: string;
}

// ─────────────────────────────────────────────────────────────────
// Helper: format a Date | string | null into "YYYY-MM-DDTHH:mm"
// ─────────────────────────────────────────────────────────────────
function formatDateForPayload(date: Date | string | null | undefined): string {
    if (!date) return "";
    try {
        const d = new Date(date);
        if (isNaN(d.getTime())) return "";
        const pad = (n: number) => String(n).padStart(2, "0");
        return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
    } catch {
        return "";
    }
}

/**
 * InlineAssigneePicker
 *
 * Renders a clickable "Unassigned" badge that opens a searchable member list
 * when canEdit=true, or a plain muted span when canEdit=false.
 *
 * Uses the existing `editSubTask` server action — only swaps the assignee
 * while preserving all other subtask fields.
 */
export function InlineAssigneePicker({
    subTask,
    members: allMembers,
    allowedUserIds,
    projectId,
    parentTaskId,
    canEdit,
    onAssigned,
    className,
}: InlineAssigneePickerProps) {
    const [open, setOpen] = useState(false);
    const [pending, startTransition] = useTransition();

    // 1. Filter by project membership if allowedUserIds is provided
    const members = allowedUserIds
        ? allMembers.filter(m => allowedUserIds.includes(m.userId))
        : allMembers;

    // 2. Filter to non-VIEWER project members only
    const assignableMembers = members.filter(
        (m) => m.projectRole !== "VIEWER"
    );

    const handleSelect = (member: ProjectMembersType[number]) => {
        setOpen(false);

        startTransition(async () => {
            // Build the full payload from existing subtask values, only updating assignee
            const payload = {
                name: subTask.name,
                description: subTask.description || undefined,
                taskSlug: subTask.taskSlug,
                status: (subTask.status || "TO_DO") as any,
                projectId: subTask.projectId || projectId,
                parentTaskId: subTask.parentTaskId || parentTaskId,
                assignee: member.userId,
                reviewerId:
                    (subTask.reviewer as any)?.workspaceMember?.user?.id ||
                    (subTask.reviewer as any)?.workspaceMember?.userId ||
                    (subTask as any).reviewerId ||
                    undefined,
                tag: subTask.tag?.id || (subTask as any).tagId || "",
                startDate: formatDateForPayload(subTask.startDate) || undefined,
                dueDate:
                    formatDateForPayload(subTask.dueDate) ||
                    formatDateForPayload(
                        subTask.startDate
                            ? new Date(
                                  new Date(subTask.startDate).getTime() +
                                      (subTask.days || 1) * 86400000
                              )
                            : null
                    ),
                days: subTask.days || 1,
            };

            const result = await editSubTask(payload as any, subTask.id);

            if (result.status === "success") {
                toast.success(`Assigned to ${member.user.surname || member.user.name}`);
                onAssigned(member.userId, member);
            } else {
                toast.error(result.message || "Failed to update assignee");
            }
        });
    };

    // ── Non-editable: plain muted label ──────────────────────────
    if (!canEdit) {
        return (
            <span
                className={cn(
                    "text-[10px] sm:text-xs text-red-600 dark:text-red-400 font-bold bg-red-100 dark:bg-red-900/30 px-2 py-0.5 rounded-md animate-pulse",
                    className
                )}
            >
                Unassigned
            </span>
        );
    }

    // ── Editable: clickable popover ───────────────────────────────
    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <button
                    type="button"
                    disabled={pending}
                    className={cn(
                        "inline-flex items-center gap-1 text-[10px] sm:text-xs font-bold",
                        "text-red-600 dark:text-red-400",
                        "bg-red-100 dark:bg-red-900/30",
                        "hover:bg-red-200 dark:hover:bg-red-900/50",
                        "px-2 py-0.5 rounded-md",
                        "transition-colors cursor-pointer",
                        !pending && "animate-pulse",
                        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400",
                        className
                    )}
                    title="Click to assign a member"
                >
                    {pending ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                        <UserPlus className="h-3 w-3 shrink-0" />
                    )}
                    <span>{pending ? "Saving…" : "Unassigned"}</span>
                </button>
            </PopoverTrigger>

            <PopoverContent
                className="p-0 w-56"
                align="start"
                side="bottom"
                onClick={(e) => e.stopPropagation()}
            >
                <Command>
                    <CommandInput placeholder="Search member…" className="h-8 text-xs" />
                    <CommandList>
                        <CommandEmpty className="py-4 text-center text-xs text-muted-foreground">
                            No members found.
                        </CommandEmpty>
                        <CommandGroup>
                            {assignableMembers.map((member) => {
                                const displayName =
                                    member.user.surname || member.user.name || "Unknown";
                                const roleLabel =
                                    member.projectRole === "PROJECT_MANAGER"
                                        ? "PM"
                                        : member.projectRole === "LEAD"
                                        ? "Lead"
                                        : member.projectRole || "";

                                return (
                                    <CommandItem
                                        key={member.userId}
                                        value={displayName}
                                        onSelect={() => handleSelect(member)}
                                        className="flex items-center gap-2 cursor-pointer text-xs"
                                    >
                                        <Check className="h-3.5 w-3.5 opacity-0" />
                                        <span className="flex-1 truncate">{displayName}</span>
                                        {roleLabel && (
                                            <span className="text-[10px] text-muted-foreground shrink-0">
                                                {roleLabel}
                                            </span>
                                        )}
                                    </CommandItem>
                                );
                            })}
                        </CommandGroup>
                    </CommandList>
                </Command>
            </PopoverContent>
        </Popover>
    );
}
