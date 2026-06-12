"use client";

import { useState, useRef, useEffect, useTransition, useMemo } from "react";
import { AlertCircle, GripHorizontal } from "lucide-react";
import { parseDate, formatDate, getDaysBetween, formatDateForAPI } from "./utils";
import { cn } from "@/lib/utils";
import { useRemainingDays } from "@/hooks/use-due-date";
import { getDelayColors, getDelayText, getStatusColors } from "@tusker/shared/colors";
import { toast } from "sonner";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { GanttSubtask } from "./types";
import { apiClient } from "@/lib/api-client";

interface DraggableSubtaskBarProps {
    subtask: GanttSubtask;
    timelineStart: Date;
    totalDays: number;
    workspaceId?: string;
    projectId?: string;
    currentUser?: { id: string };
    permissions?: {
        isWorkspaceAdmin: boolean;
        leadProjectIds?: string[];
        managedProjectIds?: string[];
        coordinatorProjectIds?: string[];
    };
    isHighlighted?: boolean;
    onToggleHighlight?: () => void;
    onUpdate?: (id: string, data: Partial<GanttSubtask>) => void;
}

export function DraggableSubtaskBar({
    subtask,
    timelineStart,
    totalDays,
    workspaceId,
    projectId,
    currentUser,
    permissions,
    onToggleHighlight,
    onUpdate
}: DraggableSubtaskBarProps) {
    const [isPending, startTransition] = useTransition();
    const [isDragging, setIsDragging] = useState(false);
    const [isResizing, setIsResizing] = useState(false);
    const [resizeEdge, setResizeEdge] = useState<'left' | 'right' | null>(null);
    const [dragStart, setDragStart] = useState({ x: 0, date: new Date() });

    // Live position state for visual feedback during drag
    const [livePosition, setLivePosition] = useState<{ left: number; width: number } | null>(null);

    // Optimistic subtask state - updates immediately on drag, syncs with server data
    const [optimisticSubtask, setOptimisticSubtask] = useState<GanttSubtask>(subtask);

    // Track if we're waiting for server update
    const [isPendingUpdate, setIsPendingUpdate] = useState(false);

    const [popoverOpen, setPopoverOpen] = useState(false);
    const hasMovedRef = useRef(false);

    const barRef = useRef<HTMLDivElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);

    // Sync optimistic state with incoming prop changes (from server)
    // Only sync if we're not waiting for an update, or if the server data matches our optimistic update
    // Sync optimistic state with incoming prop changes (from server)
    const [prevSubtask, setPrevSubtask] = useState(subtask);

    if (subtask !== prevSubtask) {
        setPrevSubtask(subtask);
        if (!isPendingUpdate) {
            setOptimisticSubtask(subtask);
        } else {
            // Check if server data matches our optimistic update
            if (subtask.start === optimisticSubtask.start && subtask.end === optimisticSubtask.end) {
                setOptimisticSubtask(subtask);
                setIsPendingUpdate(false);
            }
        }
    }

    const startDate = parseDate(optimisticSubtask.start);
    const endDate = parseDate(optimisticSubtask.end);

    // Normalize dates to midnight for accurate day-based positioning
    const normalizedStartDate = startDate ? new Date(startDate) : new Date();
    normalizedStartDate.setHours(0, 0, 0, 0);
    const normalizedEndDate = endDate ? new Date(endDate) : new Date();
    normalizedEndDate.setHours(0, 0, 0, 0);
    const normalizedTimelineStart = new Date(timelineStart);
    normalizedTimelineStart.setHours(0, 0, 0, 0);

    const startOffset = startDate ? getDaysBetween(normalizedTimelineStart, normalizedStartDate) : 0;
    const duration = (startDate && endDate) ? (getDaysBetween(normalizedStartDate, normalizedEndDate) + 1) : 1;

    // Use live position if dragging, otherwise calculate from dates
    const leftPercent = livePosition ? livePosition.left : (startOffset / totalDays) * 100;
    const widthPercent = livePosition ? livePosition.width : (duration / totalDays) * 100;

    const isCompleted = optimisticSubtask.status === 'COMPLETED';
    const isCancelled = optimisticSubtask.status === 'CANCELLED';
    const isHold = optimisticSubtask.status === 'HOLD';
    const isSettled = isCompleted || isCancelled || isHold;

    const { remainingDays, isOverdue: isDueDateOverdue } = useRemainingDays(
        startDate,
        optimisticSubtask.days,
        endDate
    );

    const delayStyles = getDelayColors(remainingDays, optimisticSubtask.status);
    const delayText = getDelayText(remainingDays, optimisticSubtask.status);
    const statusColors = getStatusColors(optimisticSubtask.status);

    const isDelayed = useMemo(() => {
        if (!endDate || isSettled) return false;

        // For non-settled tasks, compare task end with today
        const referenceDate = new Date();

        referenceDate.setHours(0, 0, 0, 0);
        const taskEnd = new Date(endDate);
        taskEnd.setHours(0, 0, 0, 0);

        return taskEnd < referenceDate;
    }, [isSettled, endDate]);

    const delayWidthPercent = useMemo(() => {
        if (!isDelayed || !endDate || isSettled) return 0;

        const referenceDate = new Date();

        referenceDate.setHours(0, 0, 0, 0);
        const taskEnd = new Date(endDate);
        taskEnd.setHours(0, 0, 0, 0);

        const delayDays = getDaysBetween(taskEnd, referenceDate);
        return (delayDays / totalDays) * 100;
    }, [isDelayed, isSettled, endDate, totalDays]);


    const canEdit = useMemo(() => {
        if (!currentUser || !permissions || !projectId) return false;

        const isAssignee = optimisticSubtask.assignee?.id === currentUser.id;

        // ❌ ABSOLUTE GATE: Assignees can NEVER edit dates, regardless of any role.
        if (isAssignee) return false;

        const isWorkspaceAdmin = permissions.isWorkspaceAdmin;
        const isProjectManager = (permissions.managedProjectIds || []).includes(projectId);
        const isProjectCoordinator = (permissions.coordinatorProjectIds || []).includes(projectId);
        const isProjectLead = (permissions.leadProjectIds || []).includes(projectId);
        const isCreator = optimisticSubtask.createdById === currentUser.id;
        const assigneeRole = optimisticSubtask.assigneeRole;

        // 1. Hierarchy Rules (Strict)
        // If task is assigned to a PM, only Workspace Admin can edit/move it
        if (assigneeRole === "PROJECT_MANAGER") {
            return isWorkspaceAdmin;
        }
        // If task is assigned to a Lead, only Admin or PM can edit/move it
        if (assigneeRole === "LEAD") {
            return isWorkspaceAdmin || isProjectManager;
        }

        if (isWorkspaceAdmin || isProjectManager || isProjectCoordinator) return true;

        if (isProjectLead && isCreator) return true;

        return false;
    }, [currentUser, permissions, projectId, optimisticSubtask.createdById, optimisticSubtask.assignee, optimisticSubtask.assigneeRole]);

    const handleBarMouseDown = (e: React.MouseEvent) => {
        if (!canEdit || isResizing || !startDate) return;

        e.preventDefault();
        hasMovedRef.current = false;
        setIsDragging(true);
        setDragStart({ x: e.clientX, date: startDate });
    };

    const handleResizeRightMouseDown = (e: React.MouseEvent) => {
        if (!canEdit || !endDate) return;

        e.stopPropagation();
        e.preventDefault();
        hasMovedRef.current = false;
        setIsResizing(true);
        setResizeEdge('right');
        setDragStart({ x: e.clientX, date: endDate });
    };

    // Handle resize drag from left edge (change start date)
    const handleResizeLeftMouseDown = (e: React.MouseEvent) => {
        if (!canEdit || !startDate) return;

        e.stopPropagation();
        e.preventDefault();
        hasMovedRef.current = false;
        setIsResizing(true);
        setResizeEdge('left');
        setDragStart({ x: e.clientX, date: startDate });
    };

    useEffect(() => {
        const handleMouseMove = (e: MouseEvent) => {
            if (!isDragging && !isResizing) return;
            if (!containerRef.current) return;

            const container = containerRef.current.parentElement;
            if (!container) return;

            const containerRect = container.getBoundingClientRect();
            const deltaX = e.clientX - dragStart.x;
            if (Math.abs(deltaX) < 3) return; // 3px drag threshold to filter out micro-wiggles
            hasMovedRef.current = true;

            const pixelsPerDay = containerRect.width / totalDays;
            const rawDays = deltaX / pixelsPerDay;
            const daysDelta = Math.round(rawDays);

            if (isDragging) {
                daysDeltaRef.current = Math.abs(daysDelta);
                // Calculate new position as percentage for live visual feedback
                const originalLeft = (startOffset / totalDays) * 100;
                const deltaPercent = (daysDelta / totalDays) * 100;
                const newLeft = Math.max(0, Math.min(100 - widthPercent, originalLeft + deltaPercent));

                // Update live position for immediate visual feedback
                setLivePosition({
                    left: newLeft,
                    width: widthPercent
                });
            } else if (isResizing) {
                if (resizeEdge === 'right') {
                    // Resizing from right edge - change width only
                    const originalWidth = (duration / totalDays) * 100;
                    const deltaPercent = (daysDelta / totalDays) * 100;
                    const newWidth = Math.max(2, originalWidth + deltaPercent); // Minimum 2% width

                    setLivePosition({
                        left: leftPercent,
                        width: newWidth
                    });
                } else if (resizeEdge === 'left') {
                    // Resizing from left edge - change both left position and width
                    const originalLeft = (startOffset / totalDays) * 100;
                    const originalWidth = (duration / totalDays) * 100;
                    const deltaPercent = (daysDelta / totalDays) * 100;

                    const newLeft = Math.max(0, originalLeft + deltaPercent);
                    const newWidth = Math.max(2, originalWidth - deltaPercent); // Width decreases when left moves right

                    setLivePosition({
                        left: newLeft,
                        width: newWidth
                    });
                }
            }
        };

        const handleMouseUp = (e: MouseEvent) => {
            if (!isDragging && !isResizing) return;
            if (!containerRef.current || !workspaceId || !projectId) return;
            // Ensure end date exists for calculations
            if (!endDate) return;

            const container = containerRef.current.parentElement;
            if (!container) return;

            if (!hasMovedRef.current) {
                setIsDragging(false);
                setIsResizing(false);
                setResizeEdge(null);
                setLivePosition(null);
                return;
            }

            const containerRect = container.getBoundingClientRect();
            const deltaX = e.clientX - dragStart.x;
            const pixelsPerDay = containerRect.width / totalDays;
            const rawDays = deltaX / pixelsPerDay;
            const daysDelta = Math.round(rawDays);

            if (isDragging && daysDelta !== 0) {
                const dragBaseDate = dragStart.date;
                if (!dragBaseDate || !endDate) return;

                const newStartDate = new Date(dragBaseDate);
                newStartDate.setDate(newStartDate.getDate() + daysDelta);

                const newEndDate = new Date(endDate);
                newEndDate.setDate(newEndDate.getDate() + daysDelta);

                const startStr = formatDateForAPI(newStartDate, 'start');
                const endStr = formatDateForAPI(newEndDate, 'end');

                setOptimisticSubtask(prev => ({
                    ...prev,
                    start: startStr,
                    end: endStr
                }));

                // Inform parent about the update for sidebar sync
                onUpdate?.(subtask.id, {
                    start: startStr,
                    end: endStr
                });

                setIsPendingUpdate(true);
                const toastId = toast.loading("Updating task dates...");
                startTransition(async () => {
                    const result = await apiClient.tasks.patchTaskFields(
                        subtask.id,
                        workspaceId!,
                        projectId!,
                        { startDate: startStr, dueDate: endStr }
                    );

                    if (result.status !== "success") {
                        toast.error(result.message, { id: toastId });
                        setOptimisticSubtask(subtask);
                        setIsPendingUpdate(false);
                        setLivePosition(null);
                    } else {
                        toast.success("Task dates updated", { id: toastId });
                    }
                });
            } else if (isResizing && daysDelta !== 0) {
                if (resizeEdge === 'right') {
                    if (!startDate || !dragStart.date) return;

                    const newEndDate = new Date(dragStart.date);
                    newEndDate.setDate(newEndDate.getDate() + daysDelta);

                    const endStr = formatDateForAPI(newEndDate, 'end');
                    const startStr = formatDateForAPI(startDate, 'start');

                    if (newEndDate > startDate) {
                        setOptimisticSubtask(prev => ({
                            ...prev,
                            end: endStr
                        }));

                        // Inform parent for sidebar sync
                        onUpdate?.(subtask.id, {
                            end: endStr
                        });

                        setIsPendingUpdate(true);
                        const toastId = toast.loading("Updating task duration...");
                        startTransition(async () => {
                            const result = await apiClient.tasks.patchTaskFields(
                                subtask.id,
                                workspaceId!,
                                projectId!,
                                { startDate: startStr, dueDate: endStr }
                            );

                            if (result.status !== "success") {
                                toast.error(result.message, { id: toastId });
                                setOptimisticSubtask(subtask);
                                setIsPendingUpdate(false);
                                setLivePosition(null);
                            } else {
                                toast.success("Task duration updated", { id: toastId });
                            }
                        });
                    }
                } else if (resizeEdge === 'left') {
                    if (!endDate || !dragStart.date) return;

                    const newStartDate = new Date(dragStart.date);
                    newStartDate.setDate(newStartDate.getDate() + daysDelta);

                    const startStr = formatDateForAPI(newStartDate, 'start');
                    const endStr = formatDateForAPI(endDate, 'end');

                    if (newStartDate < endDate) {
                        setOptimisticSubtask(prev => ({
                            ...prev,
                            start: startStr
                        }));

                        // Inform parent for sidebar sync
                        onUpdate?.(subtask.id, {
                            start: startStr
                        });

                        setIsPendingUpdate(true);
                        const toastId = toast.loading("Updating task start date...");
                        startTransition(async () => {
                            const result = await apiClient.tasks.patchTaskFields(
                                subtask.id,
                                workspaceId!,
                                projectId!,
                                { startDate: startStr, dueDate: endStr }
                            );

                            if (result.status !== "success") {
                                toast.error(result.message, { id: toastId });
                                setOptimisticSubtask(subtask);
                                setIsPendingUpdate(false);
                                setLivePosition(null);
                            } else {
                                toast.success("Task start date updated", { id: toastId });
                            }
                        });
                    }
                }
            } else {
                setLivePosition(null);
            }

            setIsDragging(false);
            setIsResizing(false);
            setResizeEdge(null);
        };

        if (isDragging || isResizing) {
            document.addEventListener('mousemove', handleMouseMove);
            document.addEventListener('mouseup', handleMouseUp);
            document.body.style.cursor = isDragging ? 'grabbing' : 'ew-resize';
        }

        return () => {
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
            document.body.style.cursor = '';
        };
    }, [isDragging, isResizing, resizeEdge, dragStart, subtask.id, startDate, endDate, totalDays, workspaceId, projectId, startOffset, duration, widthPercent, leftPercent]);

    // Reset live position when subtask data changes (after server update)
    // Adjusting state during rendering to avoid useEffect cascading updates
    const [prevDates, setPrevDates] = useState({ start: optimisticSubtask.start, end: optimisticSubtask.end });

    if (!isDragging && !isResizing) {
        const datesChanged =
            prevDates.start !== optimisticSubtask.start ||
            prevDates.end !== optimisticSubtask.end;

        if (datesChanged) {
            setPrevDates({ start: optimisticSubtask.start, end: optimisticSubtask.end });
            setLivePosition(null);
        }
    }

    const daysDeltaRef = useRef(0);
    useEffect(() => {
        if (!isDragging && !isResizing) {
            const timer = setTimeout(() => { daysDeltaRef.current = 0; }, 50);
            return () => clearTimeout(timer);
        }
    }, [isDragging, isResizing]);

    const handleBarClick = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (!hasMovedRef.current) {
            onToggleHighlight?.();
            setPopoverOpen(prev => !prev);
        }
    };

    return (
        <div ref={containerRef} className="h-6 relative w-full group/bar">
            <div className="relative size-full">
                {/* Main Bar Popover (Triggers on Click) */}
                <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
                    <PopoverTrigger asChild>
                        <div
                            ref={barRef}
                            className={cn(
                                "absolute top-1 h-3 rounded-md transition-all duration-200 ease-out gantt-subtask-bar-hitbox z-10",
                                "shadow-sm hover:shadow-md",
                                "focus:outline-none focus:ring-2 focus:ring-offset-1",
                                canEdit ? "cursor-grab active:cursor-grabbing" : "cursor-default",
                                isDragging && "opacity-70 scale-105",
                                statusColors.barClass
                            )}
                            style={{
                                left: `${leftPercent}%`,
                                width: `${widthPercent}%`,
                                minWidth: '20px'
                            }}
                            onMouseDown={handleBarMouseDown}
                            onClick={handleBarClick}
                            tabIndex={0}
                            role="button"
                            aria-label={`${optimisticSubtask.name}: ${startDate ? formatDate(startDate) : 'N/A'} to ${endDate ? formatDate(endDate) : 'N/A'}`}
                        >
                            {/* Progress Overlay */}
                            <div
                                className="absolute inset-y-0 left-0 bg-black/15 dark:bg-white/15 rounded-l-md transition-all duration-300 pointer-events-none"
                                style={{
                                    width: `${subtask.progress}%`,
                                    borderRadius: subtask.progress === 100 ? 'inherit' : undefined
                                }}
                            />

                            {/* Resize handles (positioned slightly OUTSIDE for pixel-perfect precision) */}
                            {canEdit && (
                                <>
                                    {/* Left resize handle */}
                                    <div
                                        className="absolute -left-2 top-0 bottom-0 w-4 cursor-ew-resize opacity-0 group-hover/bar:opacity-100 hover:bg-white/30 rounded-l-md z-20 flex items-center justify-center"
                                        onMouseDown={handleResizeLeftMouseDown}
                                        title="Drag to change start date"
                                    >
                                        <GripHorizontal className="h-full w-2 text-white/50" />
                                    </div>

                                    {/* Right resize handle */}
                                    <div
                                        className="absolute -right-2 top-0 bottom-0 w-4 cursor-ew-resize opacity-0 group-hover/bar:opacity-100 hover:bg-white/30 rounded-r-md z-20 flex items-center justify-center"
                                        onMouseDown={handleResizeRightMouseDown}
                                        title="Drag to change end date"
                                    >
                                        <GripHorizontal className="h-full w-2 text-white/50" />
                                    </div>
                                </>
                            )}
                        </div>
                    </PopoverTrigger>
                    <PopoverContent side="top" align="center" className="bg-popover text-popover-foreground border shadow-xl max-w-xs p-3 rounded-xl z-50">
                        <div className="space-y-3">
                            <div>
                                <div className="flex items-center gap-2 mb-1">
                                    <p className="font-semibold text-sm tracking-tight text-neutral-900 dark:text-neutral-50">{optimisticSubtask.name}</p>
                                    {isCompleted && (
                                        <span className="px-1.5 py-0.5 text-[10px] font-bold bg-green-100 dark:bg-green-950 text-green-700 dark:text-green-300 rounded">
                                            DONE
                                        </span>
                                    )}
                                    {remainingDays !== null && (
                                        <span className={cn(
                                            "px-1.5 py-0.5 text-[9px] rounded flex items-center gap-1 font-bold border shrink-0",
                                            delayStyles.bgColor,
                                            delayStyles.color,
                                            delayStyles.borderColor,
                                            !isSettled && isDelayed && "animate-pulse"
                                        )}>
                                            <AlertCircle className="size-2.5" />
                                            {delayText.toUpperCase()}
                                        </span>
                                    )}
                                </div>
                                <p className="text-xs text-muted-foreground">
                                    {startDate ? formatDate(startDate) : 'N/A'} â€” {endDate ? formatDate(endDate) : 'N/A'} ({duration} days)
                                </p>
                                {isDelayed && !isSettled && (
                                    <p className="text-[10px] font-bold text-red-600 dark:text-red-400 mt-0.5 animate-pulse">
                                        âš ï¸ Delayed by {Math.round((delayWidthPercent / 100) * totalDays)} days
                                    </p>
                                )}
                            </div>

                            <div className="space-y-1">
                                <div className="flex items-center justify-between text-xs">
                                    <span className="text-muted-foreground font-medium">Progress</span>
                                    <span className="font-bold text-neutral-800 dark:text-neutral-200">{subtask.progress}%</span>
                                </div>
                                <div className="w-full h-1.5 bg-neutral-100 dark:bg-neutral-800 rounded-full overflow-hidden">
                                    <div
                                        className="h-full bg-blue-500 rounded-full transition-all duration-300"
                                        style={{ width: `${subtask.progress}%` }}
                                    />
                                </div>
                            </div>

                            {canEdit ? (
                                <p className="text-[10px] text-blue-600 dark:text-blue-400 font-medium text-center pt-2 border-t border-neutral-100 dark:border-neutral-800">
                                    💡 Drag to move • Drag edge to resize
                                </p>
                            ) : (
                                <p className="text-[10px] text-muted-foreground/60 text-center pt-2 border-t border-neutral-100 dark:border-neutral-800">
                                    🔒 Dates are locked. Assignees cannot edit task dates.
                                </p>
                            )}
                        </div>
                    </PopoverContent>
                </Popover>

                {/* Delay Bar (purely visual representation) */}
                {delayWidthPercent > 0 && (
                    <div
                        className="absolute top-1.5 h-2 rounded-r-md z-0 overflow-hidden"
                        style={{
                            left: `${leftPercent + widthPercent}%`,
                            width: `${delayWidthPercent}%`,
                            backgroundImage: `repeating-linear-gradient(
                                ${isSettled ? '-45deg' : '45deg'},
                                ${statusColors.hex}1A,
                                ${statusColors.hex}1A 4px,
                                ${statusColors.hex}66 4px,
                                ${statusColors.hex}66 8px
                            )`,
                            border: `1px solid ${statusColors.hex}80`,
                            borderLeft: 'none',
                            backgroundColor: `${statusColors.hex}0D`
                        }}
                        title={`Delayed by ${Math.round((delayWidthPercent / 100) * totalDays)} days`}
                    />
                )}
            </div>
        </div>
    );
}

