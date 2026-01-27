"use client";

import { useState, useEffect } from "react";
import {
    DndContext,
    closestCenter,
    KeyboardSensor,
    PointerSensor,
    useSensor,
    useSensors,
    DragEndEvent,
} from "@dnd-kit/core";
import {
    arrayMove,
    SortableContext,
    sortableKeyboardCoordinates,
    useSortable,
    verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, CornerDownRight } from "lucide-react";
import { DraggableSubtaskBar } from "./draggable-subtask-bar";
import { cn } from "@/lib/utils";
import { GanttSubtask } from "./types";

interface SortableSubtaskRowProps {
    subtask: GanttSubtask;
    timelineStart: Date;
    totalDays: number;
    onManageDependencies?: (subtask: GanttSubtask) => void;
    onSubtaskClick?: (subtaskId: string) => void;
    workspaceId?: string;
    projectId?: string;
}

function SortableSubtaskRow({ subtask, timelineStart, totalDays, onManageDependencies, onSubtaskClick, workspaceId, projectId }: SortableSubtaskRowProps) {
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging,
    } = useSortable({ id: subtask.id });

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
    };

    return (
        <>
            {/* Left Panel - Subtask Name with Drag Handle */}
            <div
                ref={setNodeRef}
                style={style}
                className={cn(
                    "sticky left-0 z-30 w-[200px] min-w-[200px] flex items-center gap-1 px-2 py-1.5 pl-8 min-h-[32px]",
                    "bg-neutral-50 dark:bg-neutral-800/30",
                    "border-b border-r border-neutral-200 dark:border-neutral-700",
                    "transition-colors duration-150",
                    !isDragging && "hover:bg-neutral-100 dark:hover:bg-neutral-800/50",
                    isDragging && "bg-blue-100 dark:bg-blue-900/40 border-blue-300 dark:border-blue-600 opacity-50"
                )}
            >
                <CornerDownRight className="h-3 w-3 text-muted-foreground/30 shrink-0 mr-[-4px]" />
                {/* Drag Handle */}
                <div
                    {...attributes}
                    {...listeners}
                    className={cn(
                        "cursor-grab active:cursor-grabbing p-1 rounded",
                        "text-muted-foreground/50 hover:text-muted-foreground",
                        "hover:bg-neutral-200 dark:hover:bg-neutral-700",
                        "transition-all duration-200"
                    )}
                    title="Drag to reorder"
                >
                    <GripVertical className="h-4 w-4" />
                </div>
                <span
                    className="text-sm text-muted-foreground truncate flex-1 cursor-pointer hover:text-foreground hover:underline transition-colors"
                    onClick={() => onSubtaskClick?.(subtask.id)}
                    title="Click to view details"
                >
                    {subtask.name}
                </span>
                {/* Dependency indicator */}
                {subtask.dependsOnIds && subtask.dependsOnIds.length > 0 && (
                    <span className="text-xs text-muted-foreground/60">
                        ⟵ {subtask.dependsOnIds.length}
                    </span>
                )}
            </div>

            {/* Right Panel - Subtask Bar */}
            <div
                style={style}
                className={cn(
                    "relative min-h-[32px] flex items-center w-full",
                    "bg-neutral-50 dark:bg-neutral-800/30",
                    "border-b border-neutral-200 dark:border-neutral-700",
                    "transition-colors duration-150",
                    !isDragging && "hover:bg-neutral-100 dark:hover:bg-neutral-800/50",
                    isDragging && "bg-blue-100 dark:bg-blue-900/40 border-blue-300 dark:border-blue-600 opacity-50"
                )}
            >
                <DraggableSubtaskBar
                    subtask={subtask}
                    timelineStart={timelineStart}
                    totalDays={totalDays}
                    onManageDependencies={onManageDependencies ? () => onManageDependencies(subtask) : undefined}
                    workspaceId={workspaceId}
                    projectId={projectId}
                />
            </div>
        </>
    );
}

interface SortableSubtaskListProps {
    taskId: string;
    subtasks: GanttSubtask[];
    timelineStart: Date;
    totalDays: number;
    onReorder: (taskId: string, subtaskIds: string[]) => void;
    onManageDependencies?: (subtask: GanttSubtask) => void;
    onSubtaskClick?: (subtaskId: string) => void;
    workspaceId?: string;
    projectId?: string;
}

export function SortableSubtaskList({
    taskId,
    subtasks,
    timelineStart,
    totalDays,
    onReorder,
    onManageDependencies,
    onSubtaskClick,
    workspaceId,
    projectId,
}: SortableSubtaskListProps) {
    const [items, setItems] = useState(subtasks);

    // Update items when subtasks are added/removed, but preserve order when just data changes
    // Compare the set of IDs, not their order
    useEffect(() => {
        const currentIds = new Set(items.map(item => item.id));
        const newIds = new Set(subtasks.map(sub => sub.id));

        // Check if IDs have changed (added or removed)
        const idsChanged =
            currentIds.size !== newIds.size ||
            [...currentIds].some(id => !newIds.has(id));

        if (idsChanged) {
            // Items were added or removed, update the entire list
            setItems(subtasks);
        } else {
            // Same items, just update their data while preserving current order
            setItems(prevItems =>
                prevItems.map(prevItem => {
                    const updatedItem = subtasks.find(sub => sub.id === prevItem.id);
                    return updatedItem || prevItem;
                })
            );
        }
    }, [subtasks]);

    const sensors = useSensors(
        useSensor(PointerSensor),
        useSensor(KeyboardSensor, {
            coordinateGetter: sortableKeyboardCoordinates,
        })
    );

    const handleDragEnd = (event: DragEndEvent) => {
        const { active, over } = event;

        if (over && active.id !== over.id) {
            const oldIndex = items.findIndex((item) => item.id === active.id);
            const newIndex = items.findIndex((item) => item.id === over.id);

            const newItems = arrayMove(items, oldIndex, newIndex);
            setItems(newItems);

            // Call the onReorder callback with new order
            onReorder(taskId, newItems.map((item) => item.id));
        }
    };

    return (
        <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
        >
            <SortableContext items={items.map((s) => s.id)} strategy={verticalListSortingStrategy}>
                {items.map((subtask) => (
                    <SortableSubtaskRow
                        key={subtask.id}
                        subtask={subtask}
                        timelineStart={timelineStart}
                        totalDays={totalDays}
                        onManageDependencies={onManageDependencies}
                        onSubtaskClick={onSubtaskClick}
                        workspaceId={workspaceId}
                        projectId={projectId}
                    />
                ))}
            </SortableContext>
        </DndContext>
    );
}
