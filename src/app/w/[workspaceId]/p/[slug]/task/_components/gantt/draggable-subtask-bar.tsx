"use client";

import { useState, useRef, useEffect, useTransition } from "react";
import { AlertCircle, Link, Link2, GripHorizontal } from "lucide-react";
import { parseDate, formatDate, getDaysBetween } from "./utils";
import { updateSubtaskDates } from "./drag-actions";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import { GanttSubtask } from "./types";

interface DraggableSubtaskBarProps {
    subtask: GanttSubtask;
    timelineStart: Date;
    totalDays: number;
    onManageDependencies?: () => void;
    workspaceId?: string;
    projectId?: string;
    onDragConnectionStart?: (subtaskId: string) => void;
    onDragConnectionEnd?: (fromSubtaskId: string, toSubtaskId: string) => void;
    isConnectionTarget?: boolean;
}

export function DraggableSubtaskBar({
    subtask,
    timelineStart,
    totalDays,
    onManageDependencies,
    workspaceId,
    projectId,
    onDragConnectionStart,
    onDragConnectionEnd,
    isConnectionTarget
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

    const barRef = useRef<HTMLDivElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);

    // Sync optimistic state with incoming prop changes (from server)
    // Only sync if we're not waiting for an update, or if the server data matches our optimistic update
    useEffect(() => {
        if (!isPendingUpdate) {
            // No pending update, safe to sync
            setOptimisticSubtask(subtask);
        } else {
            // Check if server data matches our optimistic update
            if (subtask.start === optimisticSubtask.start && subtask.end === optimisticSubtask.end) {
                // Server has caught up with our optimistic update
                setOptimisticSubtask(subtask);
                setIsPendingUpdate(false);
            }
            // Otherwise, keep the optimistic state until server catches up
        }
    }, [subtask, isPendingUpdate, optimisticSubtask.start, optimisticSubtask.end]);

    const startDate = parseDate(optimisticSubtask.start);
    const endDate = parseDate(optimisticSubtask.end);

    if (!startDate || !endDate) {
        return (
            <div className="h-6 flex items-center px-2">
                <span className="text-xs text-destructive">Invalid dates</span>
            </div>
        );
    }

    // Normalize dates to midnight for accurate day-based positioning
    const normalizedStartDate = new Date(startDate);
    normalizedStartDate.setHours(0, 0, 0, 0);
    const normalizedEndDate = new Date(endDate);
    normalizedEndDate.setHours(0, 0, 0, 0);
    const normalizedTimelineStart = new Date(timelineStart);
    normalizedTimelineStart.setHours(0, 0, 0, 0);

    const startOffset = getDaysBetween(normalizedTimelineStart, normalizedStartDate);
    const duration = getDaysBetween(normalizedStartDate, normalizedEndDate) + 1;

    // Use live position if dragging, otherwise calculate from dates
    const leftPercent = livePosition ? livePosition.left : (startOffset / totalDays) * 100;
    const widthPercent = livePosition ? livePosition.width : (duration / totalDays) * 100;

    const isBlocked = optimisticSubtask.isBlocked || false;
    const isCompleted = optimisticSubtask.status === 'COMPLETED';
    const hasDependencies = optimisticSubtask.dependsOnIds && optimisticSubtask.dependsOnIds.length > 0;

    // Handle bar drag (move dates)
    const handleBarMouseDown = (e: React.MouseEvent) => {
        if (!workspaceId || !projectId || isResizing) return;

        e.preventDefault();
        setIsDragging(true);
        setDragStart({ x: e.clientX, date: startDate });
    };

    // Handle resize drag from right edge (change end date)
    const handleResizeRightMouseDown = (e: React.MouseEvent) => {
        if (!workspaceId || !projectId) return;

        e.stopPropagation();
        e.preventDefault();
        setIsResizing(true);
        setResizeEdge('right');
        setDragStart({ x: e.clientX, date: endDate });
    };

    // Handle resize drag from left edge (change start date)
    const handleResizeLeftMouseDown = (e: React.MouseEvent) => {
        if (!workspaceId || !projectId) return;

        e.stopPropagation();
        e.preventDefault();
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
            const pixelsPerDay = containerRect.width / totalDays;
            const daysDelta = Math.round(deltaX / pixelsPerDay);

            if (isDragging) {
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

            const container = containerRef.current.parentElement;
            if (!container) return;

            const containerRect = container.getBoundingClientRect();
            const deltaX = e.clientX - dragStart.x;
            const pixelsPerDay = containerRect.width / totalDays;
            const daysDelta = Math.round(deltaX / pixelsPerDay);

            if (isDragging && daysDelta !== 0) {
                const newStartDate = new Date(dragStart.date);
                newStartDate.setDate(newStartDate.getDate() + daysDelta);

                const newEndDate = new Date(endDate);
                newEndDate.setDate(newEndDate.getDate() + daysDelta);

                // Optimistically update the subtask state immediately
                setOptimisticSubtask(prev => ({
                    ...prev,
                    start: formatDate(newStartDate),
                    end: formatDate(newEndDate)
                }));

                // Mark that we're waiting for server update
                setIsPendingUpdate(true);

                // Save to database with loading toast
                const toastId = toast.loading("Updating task dates...");
                startTransition(async () => {
                    const result = await updateSubtaskDates(
                        subtask.id,
                        formatDate(newStartDate),
                        formatDate(newEndDate),
                        projectId,
                        workspaceId
                    );

                    if (!result.success) {
                        toast.error(result.message, { id: toastId });
                        // Revert optimistic update on error
                        setOptimisticSubtask(subtask);
                        setIsPendingUpdate(false);
                        setLivePosition(null);
                    } else {
                        toast.success("Task dates updated", { id: toastId });
                        // Don't reset isPendingUpdate here - let the useEffect handle it when server data arrives
                    }
                });
            } else if (isResizing && daysDelta !== 0) {
                if (resizeEdge === 'right') {
                    // Resizing from right edge - change end date
                    const newEndDate = new Date(dragStart.date);
                    newEndDate.setDate(newEndDate.getDate() + daysDelta);

                    if (newEndDate > startDate) {
                        // Optimistically update the subtask state immediately
                        setOptimisticSubtask(prev => ({
                            ...prev,
                            end: formatDate(newEndDate)
                        }));

                        // Mark that we're waiting for server update
                        setIsPendingUpdate(true);

                        const toastId = toast.loading("Updating task duration...");
                        startTransition(async () => {
                            const result = await updateSubtaskDates(
                                subtask.id,
                                formatDate(startDate),
                                formatDate(newEndDate),
                                projectId,
                                workspaceId
                            );

                            if (!result.success) {
                                toast.error(result.message, { id: toastId });
                                // Revert optimistic update on error
                                setOptimisticSubtask(subtask);
                                setIsPendingUpdate(false);
                                setLivePosition(null);
                            } else {
                                toast.success("Task duration updated", { id: toastId });
                            }
                        });
                    }
                } else if (resizeEdge === 'left') {
                    // Resizing from left edge - change start date
                    const newStartDate = new Date(dragStart.date);
                    newStartDate.setDate(newStartDate.getDate() + daysDelta);

                    if (newStartDate < endDate) {
                        // Optimistically update the subtask state immediately
                        setOptimisticSubtask(prev => ({
                            ...prev,
                            start: formatDate(newStartDate)
                        }));

                        // Mark that we're waiting for server update
                        setIsPendingUpdate(true);

                        const toastId = toast.loading("Updating task start date...");
                        startTransition(async () => {
                            const result = await updateSubtaskDates(
                                subtask.id,
                                formatDate(newStartDate),
                                formatDate(endDate),
                                projectId,
                                workspaceId
                            );

                            if (!result.success) {
                                toast.error(result.message, { id: toastId });
                                // Revert optimistic update on error
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
                // No change, reset immediately
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
    // Use a ref to track previous values to avoid resetting on every render
    const prevDatesRef = useRef({ start: optimisticSubtask.start, end: optimisticSubtask.end });

    useEffect(() => {
        // Only reset if we're not currently dragging AND the dates actually changed from server
        if (!isDragging && !isResizing) {
            const datesChanged =
                prevDatesRef.current.start !== optimisticSubtask.start ||
                prevDatesRef.current.end !== optimisticSubtask.end;

            if (datesChanged) {
                // Server data has updated, reset live position
                setLivePosition(null);
                prevDatesRef.current = { start: optimisticSubtask.start, end: optimisticSubtask.end };
            }
        }
    }, [optimisticSubtask.start, optimisticSubtask.end, isDragging, isResizing]);

    return (
        <div ref={containerRef} className="h-6 relative w-full group/bar">
            <TooltipProvider delayDuration={100}>
                <Tooltip>
                    <TooltipTrigger asChild>
                        <div
                            ref={barRef}
                            className={cn(
                                "absolute top-1 h-4 rounded-md transition-all duration-200 ease-out",
                                "shadow-sm hover:shadow-md",
                                "focus:outline-none focus:ring-2 focus:ring-offset-1",
                                workspaceId && projectId && "cursor-grab active:cursor-grabbing",
                                isDragging && "opacity-70 scale-105",
                                isConnectionTarget && "ring-2 ring-blue-500 ring-offset-2",
                                // Status-based colors
                                isBlocked
                                    ? "bg-amber-400 dark:bg-amber-500 hover:bg-amber-500 dark:hover:bg-amber-600 focus:ring-amber-500"
                                    : isCompleted
                                        ? "bg-green-400 dark:bg-green-500 hover:bg-green-500 dark:hover:bg-green-600 focus:ring-green-500"
                                        : "bg-blue-300 dark:bg-blue-400 hover:bg-blue-400 dark:hover:bg-blue-500 focus:ring-blue-500",
                                isBlocked && "bg-gradient-to-r from-amber-400 via-amber-300 to-amber-400 dark:from-amber-500 dark:via-amber-400 dark:to-amber-500 bg-[length:10px_100%]"
                            )}
                            style={{
                                left: `${leftPercent}%`,
                                width: `${widthPercent}%`,
                                minWidth: '20px'
                            }}
                            onMouseDown={handleBarMouseDown}
                            tabIndex={0}
                            role="button"
                            aria-label={`${optimisticSubtask.name}: ${formatDate(startDate)} to ${formatDate(endDate)}`}
                        >
                            {/* Resize handles */}
                            {workspaceId && projectId && (
                                <>
                                    {/* Left resize handle */}
                                    <div
                                        className="absolute left-0 top-0 bottom-0 w-2 cursor-ew-resize opacity-0 group-hover/bar:opacity-100 hover:bg-white/30 rounded-l-md"
                                        onMouseDown={handleResizeLeftMouseDown}
                                        title="Drag to change start date"
                                    >
                                        <GripHorizontal className="h-full w-full text-white/50" />
                                    </div>

                                    {/* Right resize handle */}
                                    <div
                                        className="absolute right-0 top-0 bottom-0 w-2 cursor-ew-resize opacity-0 group-hover/bar:opacity-100 hover:bg-white/30 rounded-r-md"
                                        onMouseDown={handleResizeRightMouseDown}
                                        title="Drag to change end date"
                                    >
                                        <GripHorizontal className="h-full w-full text-white/50" />
                                    </div>
                                </>
                            )}

                            {/* Icons */}
                            {isBlocked && (
                                <AlertCircle className="absolute -top-1 -left-1 h-3 w-3 text-amber-700 dark:text-amber-300 bg-white dark:bg-neutral-900 rounded-full" />
                            )}
                            {hasDependencies && !isBlocked && (
                                <Link className="absolute -top-1 -left-1 h-3 w-3 text-blue-600 dark:text-blue-300 bg-white dark:bg-neutral-900 rounded-full p-0.5" />
                            )}

                            {/* Dependency Management Button */}
                            {onManageDependencies && (
                                <Button
                                    size="sm"
                                    variant="ghost"
                                    className={cn(
                                        "absolute -right-8 top-1/2 -translate-y-1/2 h-6 w-6 p-0",
                                        "opacity-0 group-hover/bar:opacity-100 transition-opacity",
                                        "bg-white dark:bg-neutral-800 border shadow-sm",
                                        "hover:bg-blue-50 dark:hover:bg-blue-900/20"
                                    )}
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        onManageDependencies();
                                    }}
                                    title="Manage dependencies"
                                >
                                    <Link2 className="h-3 w-3" />
                                </Button>
                            )}
                        </div>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="bg-popover text-popover-foreground border shadow-lg max-w-xs">
                        <div className="space-y-1.5">
                            <div className="flex items-center gap-2">
                                <p className="font-medium text-sm">{optimisticSubtask.name}</p>
                                {isBlocked && (
                                    <span className="px-1.5 py-0.5 text-xs bg-amber-100 dark:bg-amber-900 text-amber-700 dark:text-amber-300 rounded">
                                        BLOCKED
                                    </span>
                                )}
                                {isCompleted && (
                                    <span className="px-1.5 py-0.5 text-xs bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300 rounded">
                                        DONE
                                    </span>
                                )}
                            </div>
                            <p className="text-xs text-muted-foreground">
                                {formatDate(startDate)} — {formatDate(endDate)}
                            </p>
                            <p className="text-xs text-muted-foreground">
                                {duration} days
                            </p>
                            {workspaceId && projectId && (
                                <p className="text-xs text-blue-600 dark:text-blue-400 pt-1 border-t">
                                    💡 Drag to move • Drag edge to resize
                                </p>
                            )}
                            {isBlocked && optimisticSubtask.blockedByNames && optimisticSubtask.blockedByNames.length > 0 && (
                                <div className="pt-1 border-t border-amber-200 dark:border-amber-800">
                                    <p className="text-xs text-amber-700 dark:text-amber-300 flex items-center gap-1">
                                        <AlertCircle className="h-3 w-3" />
                                        Waiting for:
                                    </p>
                                    <ul className="text-xs text-muted-foreground ml-4 mt-0.5">
                                        {optimisticSubtask.blockedByNames.map((name: string, idx: number) => (
                                            <li key={idx}>• {name}</li>
                                        ))}
                                    </ul>
                                </div>
                            )}
                            {hasDependencies && !isBlocked && (
                                <div className="pt-1 border-t">
                                    <p className="text-xs text-muted-foreground flex items-center gap-1">
                                        <Link className="h-3 w-3" />
                                        Dependencies: {optimisticSubtask.dependsOnIds.length}
                                    </p>
                                </div>
                            )}
                        </div>
                    </TooltipContent>
                </Tooltip>
            </TooltipProvider>
        </div>
    );
}
