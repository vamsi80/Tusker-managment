"use client";

import { useState, useEffect } from "react";
import { DndContext, DragEndEvent, DragOverlay, DragStartEvent, closestCorners, PointerSensor, useSensor, useSensors, useDroppable } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { Badge } from "@/components/ui/badge";
import { AllSubTaskType } from "@/app/data/task/get-project-tasks";
import { ProjectMembersType } from "@/app/data/project/get-project-members";
import { cn } from "@/lib/utils";
import { KanbanCard } from "./kanban-card";
import { KanbanToolbar } from "./kanban-toolbar";

type TaskStatus = "TO_DO" | "IN_PROGRESS" | "BLOCKED" | "REVIEW" | "COMPLETED";

interface KanbanBoardProps {
    initialSubTasks: AllSubTaskType;
    projectMembers: ProjectMembersType;
    workspaceId: string;
    projectId: string;
}

const COLUMNS: { id: TaskStatus; title: string; color: string; bgColor: string; borderColor: string }[] = [
    {
        id: "TO_DO",
        title: "To Do",
        color: "text-slate-700",
        bgColor: "bg-slate-50",
        borderColor: "border-slate-200",
    },
    {
        id: "IN_PROGRESS",
        title: "In Progress",
        color: "text-blue-700",
        bgColor: "bg-blue-50",
        borderColor: "border-blue-200",
    },
    {
        id: "BLOCKED",
        title: "Blocked",
        color: "text-red-700",
        bgColor: "bg-red-50",
        borderColor: "border-red-200",
    },
    {
        id: "REVIEW",
        title: "Review",
        color: "text-amber-700",
        bgColor: "bg-amber-50",
        borderColor: "border-amber-200",
    },
    {
        id: "COMPLETED",
        title: "Completed",
        color: "text-green-700",
        bgColor: "bg-green-50",
        borderColor: "border-green-200",
    },
];

function DroppableColumn({
    column,
    subTasks,
}: {
    column: typeof COLUMNS[number];
    subTasks: AllSubTaskType;
}) {
    const { setNodeRef, isOver } = useDroppable({
        id: column.id,
    });

    return (
        <div className="flex-shrink-0 w-80 flex flex-col h-full">
            {/* Column Header */}
            <div
                className={cn(
                    "border-2 border-b p-4",
                    column.borderColor,
                    column.bgColor
                )}
            >
                <div className="flex items-center justify-between">
                    <h3 className={cn("font-semibold text-sm", column.color)}>
                        {column.title}
                    </h3>
                    <Badge
                        variant="secondary"
                        className={cn("text-xs", column.color)}
                    >
                        {subTasks.length}
                    </Badge>
                </div>
            </div>

            {/* Column Content with individual scroll */}
            <div
                ref={setNodeRef}
                className={cn(
                    "flex-1 border-2 border-t-0 p-3 transition-colors overflow-y-auto",
                    column.borderColor,
                    isOver && "bg-slate-50/50",
                    // Custom ultra-thin scrollbar
                    "[&::-webkit-scrollbar]:w-0.5",
                    "[&::-webkit-scrollbar-track]:bg-transparent",
                    "[&::-webkit-scrollbar-thumb]:bg-slate-300",
                    "[&::-webkit-scrollbar-thumb]:rounded-full",
                    "[&::-webkit-scrollbar-thumb]:hover:bg-slate-400"
                )}
            >
                <SortableContext
                    items={subTasks.map((t) => t.id)}
                    strategy={verticalListSortingStrategy}
                >
                    <div className="space-y-3 min-h-[200px]">
                        {subTasks.map((subTask) => (
                            <KanbanCard
                                key={subTask.id}
                                subTask={subTask}
                                columnColor={column.color}
                            />
                        ))}
                        {subTasks.length === 0 && (
                            <div className="flex items-center justify-center h-32 text-muted-foreground text-sm">
                                No subtasks
                            </div>
                        )}
                    </div>
                </SortableContext>
            </div>
        </div>
    );
}

export function KanbanBoard({ initialSubTasks, projectMembers, workspaceId, projectId }: KanbanBoardProps) {
    const [subTasks, setSubTasks] = useState<AllSubTaskType>(initialSubTasks);
    const [activeSubTask, setActiveSubTask] = useState<AllSubTaskType[number] | null>(null);

    // Filter states
    const [selectedParentTask, setSelectedParentTask] = useState<string | null>(null);
    const [selectedAssignee, setSelectedAssignee] = useState<string | null>(null);
    const [visibleColumns, setVisibleColumns] = useState<Record<TaskStatus, boolean>>({
        TO_DO: true,
        IN_PROGRESS: true,
        BLOCKED: false,
        REVIEW: true,
        COMPLETED: false,
    });

    const sensors = useSensors(
        useSensor(PointerSensor, {
            activationConstraint: {
                distance: 8,
            },
        })
    );

    useEffect(() => {
        setSubTasks(initialSubTasks);
    }, [initialSubTasks]);

    const handleDragStart = (event: DragStartEvent) => {
        const { active } = event;
        const subTask = subTasks.find((t) => t.id === active.id);
        if (subTask) {
            setActiveSubTask(subTask);
        }
    };

    const handleDragEnd = (event: DragEndEvent) => {
        const { active, over } = event;
        setActiveSubTask(null);

        // If dropped outside any droppable area, do nothing (keep in current position)
        if (!over) {
            return;
        }

        const subTaskId = active.id as string;
        const newStatus = over.id as TaskStatus;

        // Validate that the drop target is a valid status column
        const validStatuses: TaskStatus[] = ["TO_DO", "IN_PROGRESS", "BLOCKED", "REVIEW", "COMPLETED"];
        if (!validStatuses.includes(newStatus)) {
            return;
        }

        // Only update if status changed
        const subTask = subTasks.find((t) => t.id === subTaskId);
        if (subTask && subTask.status !== newStatus) {
            // Update subtask status locally (optimistic update)
            setSubTasks((prevSubTasks) =>
                prevSubTasks.map((subTask) =>
                    subTask.id === subTaskId ? { ...subTask, status: newStatus } : subTask
                )
            );

            // TODO: Call server action to update subtask status in database
            // updateSubTaskStatus(subTaskId, newStatus, workspaceId, projectId);
        }
    };

    const handleDragCancel = () => {
        setActiveSubTask(null);
    };

    // Get filtered subtasks
    const getFilteredSubTasks = () => {
        return subTasks.filter((subTask) => {
            const matchesParentTask = !selectedParentTask || subTask.parentTaskId === selectedParentTask;
            const matchesAssignee = !selectedAssignee || subTask.assignee?.id === selectedAssignee;
            return matchesParentTask && matchesAssignee;
        });
    };

    const getSubTasksByStatus = (status: TaskStatus) => {
        const filteredSubTasks = getFilteredSubTasks();
        return filteredSubTasks.filter((subTask) => subTask.status === status);
    };

    // Get unique parent tasks for filter
    const uniqueParentTasks = Array.from(
        new Map(
            subTasks
                .filter((st) => st.parentTask)
                .map((st) => [st.parentTask!.id, st.parentTask!])
        ).values()
    );

    return (
        <>
            <KanbanToolbar
                parentTasks={uniqueParentTasks}
                projectMembers={projectMembers}
                selectedParentTask={selectedParentTask}
                selectedAssignee={selectedAssignee}
                visibleColumns={visibleColumns}
                onParentTaskChange={setSelectedParentTask}
                onAssigneeChange={setSelectedAssignee}
                onVisibleColumnsChange={setVisibleColumns}
            />

            <DndContext
                sensors={sensors}
                collisionDetection={closestCorners}
                onDragStart={handleDragStart}
                onDragEnd={handleDragEnd}
                onDragCancel={handleDragCancel}
            >
                <div className={cn(
                    "flex gap-4 h-[calc(100vh-280px)] overflow-x-auto",
                    // Custom ultra-thin horizontal scrollbar
                    "[&::-webkit-scrollbar]:h-0.5",
                    "[&::-webkit-scrollbar-track]:bg-transparent",
                    "[&::-webkit-scrollbar-thumb]:bg-slate-300",
                    "[&::-webkit-scrollbar-thumb]:rounded-full",
                    "[&::-webkit-scrollbar-thumb]:hover:bg-slate-400"
                )}>
                    {COLUMNS.filter((col) => visibleColumns[col.id]).map((column) => {
                        const columnSubTasks = getSubTasksByStatus(column.id);
                        return (
                            <DroppableColumn
                                key={column.id}
                                column={column}
                                subTasks={columnSubTasks}
                            />
                        );
                    })}
                </div>

                {/* Drag Overlay */}
                <DragOverlay>
                    {activeSubTask ? (
                        <div className="rotate-3 opacity-80">
                            <KanbanCard subTask={activeSubTask} columnColor="text-slate-700" isDragging />
                        </div>
                    ) : null}
                </DragOverlay>
            </DndContext>
        </>
    );
}
