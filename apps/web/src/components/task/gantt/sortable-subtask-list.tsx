"use client";

import { toast } from "sonner";
import { format } from "date-fns";
import { GanttSubtask, GanttTask } from "./types";
import { useEffect, useState } from "react";
import { apiClient } from "@/lib/api-client";
import { Badge } from "@/components/ui/badge";
import { CornerDownRight, GripVertical, Link2 } from "lucide-react";
import { DraggableSubtaskBar } from "./draggable-subtask-bar";
import { cn, APP_DATE_FORMAT } from "@/lib/utils";
import { InlineDateRangePicker } from "./inline-date-range-picker";
import { InlineDaysPicker } from "./inline-days-picker";
import { ganttDateToISO } from "./utils";
import { InlineAssigneePicker, type AssignableSubTask } from "../shared/inline-assignee-picker";
import { ProjectMembersType } from "@/types/project";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, DragEndEvent } from "@dnd-kit/core";
import { arrayMove, SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { restrictToVerticalAxis, restrictToWindowEdges } from "@dnd-kit/modifiers";
import { DependencyPicker } from "./dependency-picker";
import { getStatusColors, getStatusLabel } from "@tusker/shared/colors";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { ActivityDialog } from "@/app/w/[workspaceId]/p/[slug]/_components/forms/activity-form";

interface SortableSubtaskRowProps {
    subtask: GanttSubtask;
    timelineStart: Date;
    totalDays: number;
    onSubtaskClick?: (subtaskId: string) => void;
    onSubTaskUpdate?: (subTaskId: string, data: Partial<GanttSubtask>) => void;
    workspaceId: string;
    projectId: string;
    members?: ProjectMembersType;
    currentUser?: { id: string };
    permissions?: {
        isWorkspaceAdmin: boolean;
        leadProjectIds?: string[];
        managedProjectIds?: string[];
        coordinatorProjectIds?: string[];
    };
    showDetails: boolean;
    allowedUserIds?: string[];
    allTasks?: GanttTask[];
    highlightedSubtaskId?: string | null;
    onToggleSubtaskHighlight?: (id: string) => void;
}

function SortableSubtaskRow({
    subtask,
    timelineStart,
    totalDays,
    showDetails,
    onSubtaskClick,
    onSubTaskUpdate,
    workspaceId,
    projectId,
    members,
    currentUser,
    permissions,
    allowedUserIds,
    allTasks,
    highlightedSubtaskId,
    onToggleSubtaskHighlight
}: SortableSubtaskRowProps) {
    const isHighlighted = subtask.id === highlightedSubtaskId;
    const statusColors = getStatusColors(subtask.status);
    const [showDepPicker, setShowDepPicker] = useState(false);
    const [isActivityOpen, setIsActivityOpen] = useState(false);
    const [pendingStatus, setPendingStatus] = useState<string | null>(null);

    const patchAndUpdate = async (data: {
        startDate?: string;
        dueDate?: string;
        days?: number;
    }) => {
        const optimisticUpdate: Partial<GanttSubtask> = {};
        if (data.startDate) optimisticUpdate.start = data.startDate;
        if (data.dueDate) optimisticUpdate.end = data.dueDate;
        if (data.days) optimisticUpdate.days = data.days;

        onSubTaskUpdate?.(subtask.id, optimisticUpdate);

        const toastId = toast.loading("Saving changes...");
        try {
            const result = await apiClient.tasks.patchTaskFields(
                subtask.id,
                workspaceId,
                projectId,
                {
                    startDate: data.startDate ? ganttDateToISO(data.startDate) : undefined,
                    dueDate: data.dueDate ? ganttDateToISO(data.dueDate) : undefined,
                }
            );

            if (result.status !== "success") {
                toast.error(result.message || "Failed to save changes", { id: toastId });
                // Rollback
                onSubTaskUpdate?.(subtask.id, {
                    start: subtask.start,
                    end: subtask.end,
                    days: subtask.days,
                });
            } else {
                toast.success("Changes saved successfully", { id: toastId });
            }
        } catch (error) {
            toast.error("Failed to save changes", { id: toastId });
            // Rollback
            onSubTaskUpdate?.(subtask.id, {
                start: subtask.start,
                end: subtask.end,
                days: subtask.days,
            });
        }
    };

    const handleStatusChange = async (newStatus: string) => {
        if (newStatus === subtask.status) return;

        if (subtask.status === "IN_PROGRESS" && newStatus === "COMPLETED") {
            toast.error("In-Progress tasks must go to Review before being marked as Completed.");
            return;
        }

        const isMandatory =
            ["HOLD", "CANCELLED", "REVIEW"].includes(newStatus) ||
            ["HOLD", "CANCELLED"].includes(subtask.status) ||
            (subtask.status === "REVIEW" &&
                (newStatus === "TO_DO" || newStatus === "IN_PROGRESS")) ||
            (subtask.status === "IN_PROGRESS" && newStatus === "TO_DO");

        if (isMandatory) {
            setPendingStatus(newStatus);
            setIsActivityOpen(true);
        } else {
            await performStatusUpdate(newStatus);
        }
    };

    const performStatusUpdate = async (newStatus: string, comment?: string, attachmentData?: { url: string; name?: string }) => {
        const previousStatus = subtask.status;
        onSubTaskUpdate?.(subtask.id, { status: newStatus });

        const toastId = toast.loading("Updating status...");
        try {
            const result = await apiClient.tasks.updateStatus(
                subtask.id,
                workspaceId,
                projectId,
                newStatus,
                comment,
                attachmentData
            );

            if (result.status === "success") {
                toast.success("Status updated successfully", { id: toastId });
            } else {
                toast.error(result.message || "Failed to update status", { id: toastId });
                onSubTaskUpdate?.(subtask.id, { status: previousStatus });
            }
        } catch (error) {
            toast.error("Failed to update status", { id: toastId });
            onSubTaskUpdate?.(subtask.id, { status: previousStatus });
        }
    };

    const handleActivitySubmit = async (comment: string, attachmentLink?: string) => {
        if (!pendingStatus) return;
        const attachmentData = attachmentLink ? { url: attachmentLink } : undefined;
        await performStatusUpdate(pendingStatus, comment, attachmentData);
        setPendingStatus(null);
    };

    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging
    } = useSortable({ id: subtask.id });

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        zIndex: isDragging ? 50 : undefined,
        opacity: isDragging ? 0.5 : 1,
    };


    const isAssignee = subtask.assignee?.id === currentUser?.id;
    const isWorkspaceAdmin = !!permissions?.isWorkspaceAdmin;
    const isProjectManager = !!(permissions?.managedProjectIds || []).includes(projectId);
    const isProjectCoordinator = !!(permissions?.coordinatorProjectIds || []).includes(projectId);
    const isProjectLead = !!(permissions?.leadProjectIds || []).includes(projectId);
    const isCreator = subtask.createdById === currentUser?.id;

    // ❌ ABSOLUTE GATE: Assignees can NEVER edit dates/metadata, regardless of any role.
    const canManage = !isAssignee && (
        isWorkspaceAdmin ||
        isProjectManager ||
        isProjectCoordinator ||
        (isProjectLead && isCreator)
    );

    const handleRowClick = (e: React.MouseEvent) => {
        console.log("[SortableSubtaskRow] handleRowClick TRIGGERED for:", subtask.id);
        // Prevent double highlight toggle if clicking the bar (which handles its own click)
        if ((e.target as HTMLElement).closest('.gantt-subtask-bar-hitbox')) {
            console.log("[SortableSubtaskRow] handleRowClick ignored (bar click)");
            return;
        }

        onToggleSubtaskHighlight?.(subtask.id);
    };

    return (
        <div
            ref={setNodeRef}
            style={{
                ...style,
                gridTemplateColumns: 'var(--gantt-sidebar-width) var(--gantt-total-width)',
            }}
            className={cn(
                "grid group/row transition-all duration-200 cursor-pointer relative",
                isHighlighted
                    ? cn(
                        statusColors.bgColor.replace('/10', '/20').replace('/20', '/30'),
                        "border-t border-b border-red-500/80 z-40"
                    )
                    : "border-t border-t-transparent"
            )}
            onClick={handleRowClick}
        >
            {/* Left Panel */}
            <div
                className={cn(
                    "sticky left-0 z-30 flex items-center bg-white dark:bg-neutral-900 border-b border-r border-neutral-200 dark:border-neutral-700 h-[32px] w-[var(--gantt-sidebar-width)] min-w-[var(--gantt-sidebar-width)] shrink-0 transition-colors duration-200 overflow-hidden",
                    isDragging && "bg-blue-50/50 dark:bg-blue-900/10",
                    isHighlighted && cn(
                        statusColors.bgColor.replace('/10', '/30').replace('/20', '/40'),
                        "border-t border-b border-red-500/80 !z-50"
                    )
                )}
            >
                {/* Drag Handle & Name */}
                <div className="w-[var(--col-name)] flex items-center gap-1 px-1 shrink-0 border-r border-neutral-200 dark:border-neutral-700 h-full relative group">
                    {/* Gripper - only visible on hover or dragging */}
                    <div
                        {...attributes}
                        {...listeners}
                        className={cn(
                            "cursor-grab active:cursor-grabbing p-1 text-muted-foreground/30 hover:text-muted-foreground transition-colors",
                            !canManage && "pointer-events-none opacity-0"
                        )}
                    >
                        <GripVertical className="size-3.5" />
                    </div>

                    <CornerDownRight className="size-3 text-muted-foreground/30 shrink-0" />

                    <span
                        className="text-[12px] text-muted-foreground truncate flex-1 cursor-pointer hover:text-foreground hover:underline transition-colors pl-1"
                        onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            console.log("[SortableSubtaskRow] Subtask Name Clicked:", subtask.id);
                            if (!onSubtaskClick) {
                                console.error("[SortableSubtaskRow] onSubtaskClick MISSING!");
                                return;
                            }
                            console.log("[SortableSubtaskRow] Propagating click to parent...");
                            onSubtaskClick(subtask.id);
                        }}
                        title={subtask.name}
                    >
                        {subtask.name}
                    </span>

                    {/* Dependency Link Button */}
                    {subtask.status !== "COMPLETED" && subtask.status !== "CANCELLED" && (
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                setShowDepPicker(true);
                            }}
                            className={cn(
                                "absolute right-1 opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-all",
                                subtask.dependsOnIds && subtask.dependsOnIds.length > 0 && "opacity-100 text-blue-500"
                            )}
                            title="Manage Dependencies"
                        >
                            <Link2 className="size-3" />
                        </button>
                    )}
                </div>

                {showDetails && (
                    <>
                        <div className="w-[var(--col-assignee)] flex items-center px-1 shrink-0 border-r border-neutral-200 dark:border-neutral-700 h-full overflow-hidden">
                            {members && (
                                <InlineAssigneePicker
                                    subTask={subtask as AssignableSubTask}
                                    members={members}
                                    projectId={projectId}
                                    parentTaskId={subtask.parentTaskId || ""}
                                    canEdit={canManage && !subtask.assigneeId}
                                    onAssigned={(userId, member) => {
                                        onSubTaskUpdate?.(subtask.id, {
                                            assigneeId: member.projectMemberId,
                                            assignee: {
                                                id: member.userId,
                                                surname: member.user.surname || "",
                                            }
                                        });
                                    }}
                                    allowedUserIds={allowedUserIds}
                                />
                            )}
                        </div>

                        <div className="w-[var(--col-progress)] flex items-center px-2 shrink-0 border-r border-neutral-200 dark:border-neutral-700 h-full justify-center">
                            <span className={cn(
                                "text-[10px] font-medium px-1 py-0.5 rounded bg-neutral-100 dark:bg-neutral-800",
                                subtask.progress === 100 ? "text-green-600 dark:text-green-400" : "text-muted-foreground"
                            )}>
                                {subtask.progress}%
                            </span>
                        </div>

                        <div className="w-[var(--col-status)] flex items-center px-2 shrink-0 border-r border-neutral-200 dark:border-neutral-700 h-full">
                            <DropdownMenu>
                                <DropdownMenuTrigger asChild disabled={!canManage}>
                                    <button className="focus:outline-none">
                                        <Badge
                                            variant="outline"
                                            className={cn(
                                                "text-[9px] px-1 py-0 h-4 font-normal uppercase whitespace-nowrap border-0 hover:opacity-80 transition-opacity cursor-pointer",
                                                getStatusColors(subtask.status).color,
                                                getStatusColors(subtask.status).bgColor,
                                                getStatusColors(subtask.status).borderColor
                                            )}
                                        >
                                            {getStatusLabel(subtask.status)}
                                        </Badge>
                                    </button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="start">
                                    {(["TO_DO", "IN_PROGRESS", "REVIEW", "HOLD", "COMPLETED", "CANCELLED"] as const).map((status) => (
                                        <DropdownMenuItem
                                            key={status}
                                            onSelect={() => handleStatusChange(status)}
                                            className="text-xs uppercase"
                                        >
                                            <Badge
                                                variant="outline"
                                                className={cn(
                                                    "text-[9px] px-1 py-0 h-4 font-normal uppercase whitespace-nowrap border-0 mr-2",
                                                    getStatusColors(status).color,
                                                    getStatusColors(status).bgColor,
                                                    getStatusColors(status).borderColor
                                                )}
                                            >
                                                {getStatusLabel(status)}
                                            </Badge>
                                        </DropdownMenuItem>
                                    ))}
                                </DropdownMenuContent>
                            </DropdownMenu>
                        </div>

                        <div className="w-[var(--col-days)] flex items-center px-2 shrink-0 border-r border-neutral-200 dark:border-neutral-700 h-full justify-center">
                            <InlineDaysPicker
                                days={subtask.days}
                                start={subtask.start}
                                disabled={!canManage}
                                onSave={(days, newEnd) =>
                                    patchAndUpdate({ dueDate: newEnd, days })
                                }
                            />
                        </div>

                        <div className="w-[var(--col-dates)] flex items-center px-2 shrink-0 h-full">
                            <InlineDateRangePicker
                                start={subtask.start}
                                end={subtask.end}
                                disabled={!canManage}
                                onSave={(startStr, endStr, days) =>
                                    patchAndUpdate({ startDate: startStr, dueDate: endStr, days })
                                }
                            />
                        </div>
                    </>
                )}
            </div>

            {/* Right Panel - Timeline Bar */}
            <div className={cn(
                "relative min-h-[32px] flex items-center w-full border-b border-neutral-200 dark:border-neutral-700 hover:bg-neutral-50/50 dark:hover:bg-neutral-800/20 transition-colors",
                isHighlighted && "border-t border-b border-red-500/80 !z-40"
            )}>
                <DraggableSubtaskBar
                    subtask={subtask}
                    timelineStart={timelineStart}
                    totalDays={totalDays}
                    workspaceId={workspaceId}
                    projectId={projectId}
                    currentUser={currentUser}
                    permissions={permissions}
                    onUpdate={(id, data) => onSubTaskUpdate?.(id, data)}
                    isHighlighted={subtask.id === highlightedSubtaskId}
                    onToggleHighlight={() => onToggleSubtaskHighlight?.(subtask.id)}
                />
            </div>

            {/* Dependency Picker Modal */}
            {allTasks && (
                <DependencyPicker
                    open={showDepPicker}
                    onOpenChange={setShowDepPicker}
                    subtask={subtask}
                    allTasks={allTasks}
                    workspaceId={workspaceId}
                    projectId={projectId}
                    onUpdate={(id, data) => onSubTaskUpdate?.(id, data)}
                />
            )}

            {isActivityOpen && (
                <ActivityDialog
                    isOpen={isActivityOpen}
                    onClose={() => {
                        setIsActivityOpen(false);
                        setPendingStatus(null);
                    }}
                    onSubmit={handleActivitySubmit}
                    subTaskName={subtask.name}
                />
            )}
        </div>
    );
}

interface SortableSubtaskListProps {
    subtasks: GanttSubtask[];
    timelineStart: Date;
    totalDays: number;
    onSubtaskClick?: (subtaskId: string) => void;
    onSubTaskUpdate?: (subTaskId: string, data: Partial<GanttSubtask>) => void;
    workspaceId: string;
    projectId: string;
    members?: ProjectMembersType;
    currentUser?: { id: string };
    permissions?: {
        isWorkspaceAdmin: boolean;
        leadProjectIds?: string[];
        managedProjectIds?: string[];
        coordinatorProjectIds?: string[];
    };
    showDetails: boolean;
    allowedUserIds?: string[];
    allTasks?: GanttTask[];
    granularity: 'days' | 'weeks' | 'months';
    highlightedSubtaskId?: string | null;
    onToggleSubtaskHighlight?: (id: string) => void;
}

export function SortableSubtaskList({
    subtasks: initialSubtasks,
    onSubtaskClick,
    ...props
}: SortableSubtaskListProps) {
    const [items, setItems] = useState(initialSubtasks);

    // Keep the rendered subtask list in sync with newly loaded batches.
    useEffect(() => {
        setItems(initialSubtasks);
    }, [initialSubtasks]);

    const handleSubTaskUpdate = (subTaskId: string, data: Partial<GanttSubtask>) => {
        setItems((prev) =>
            prev.map((s) => (s.id === subTaskId ? { ...s, ...data } : s))
        );
        props.onSubTaskUpdate?.(subTaskId, data);
    };

    const sensors = useSensors(
        useSensor(PointerSensor, {
            activationConstraint: { distance: 5 }
        }),
        useSensor(KeyboardSensor, {
            coordinateGetter: sortableKeyboardCoordinates,
        })
    );

    const handleDragEnd = async (event: DragEndEvent) => {
        const { active, over } = event;

        if (over && active.id !== over.id) {
            const oldIndex = items.findIndex((item) => item.id === active.id);
            const newIndex = items.findIndex((item) => item.id === over.id);

            const newItems = arrayMove(items, oldIndex, newIndex);
            setItems(newItems);

            // Call Hono API via apiClient
            try {
                const result = await apiClient.tasks.reorderTasks(
                    props.workspaceId,
                    props.projectId,
                    newItems.map(item => item.id)
                );
                if (result.status === "error") {
                    toast.error(result.message);
                    setItems(initialSubtasks); // Rollback
                } else {
                    toast.success("Tasks reordered successfully");
                }
            } catch (error) {
                toast.error("Failed to reorder tasks");
                setItems(initialSubtasks); // Rollback
            }
        }
    };

    return (
        <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
            modifiers={[restrictToVerticalAxis, restrictToWindowEdges]}
            autoScroll={{
                threshold: {
                    x: 0,
                    y: 0.2
                }
            }}
        >
            <SortableContext
                items={items.map(i => i.id)}
                strategy={verticalListSortingStrategy}
            >
                <div className="flex flex-col relative">
                    {items.map((subtask) => (
                        <SortableSubtaskRow
                            key={subtask.id}
                            allTasks={props.allTasks}
                            subtask={subtask}
                            onSubtaskClick={onSubtaskClick}
                            {...props}
                            onSubTaskUpdate={handleSubTaskUpdate}
                        />
                    ))}
                </div>
            </SortableContext>
        </DndContext>
    );
}

