"use client";

import { useState } from "react";
import {
    DndContext,
    DragEndEvent,
    DragOverEvent,
    DragOverlay,
    DragStartEvent,
    PointerSensor,
    useSensor,
    useSensors,
} from "@dnd-kit/core";
import { arrayMove } from "@dnd-kit/sortable";
import { KanbanColumn } from "./kanban-column";
import { KanbanCard } from "./kanban-card";
import { KanbanColumn as KanbanColumnType, KanbanSubTask } from "./types";

interface KanbanBoardProps {
    columns: KanbanColumnType[];
    onTaskMove?: (taskId: string, newStatus: KanbanSubTask['status']) => void;
    onCardClick?: (task: KanbanSubTask) => void;
}

export function KanbanBoard({ columns: initialColumns, onTaskMove, onCardClick }: KanbanBoardProps) {
    const [columns, setColumns] = useState<KanbanColumnType[]>(initialColumns);
    const [activeTask, setActiveTask] = useState<KanbanSubTask | null>(null);

    const sensors = useSensors(
        useSensor(PointerSensor, {
            activationConstraint: {
                distance: 8,
            },
        })
    );

    const handleDragStart = (event: DragStartEvent) => {
        const { active } = event;
        const task = columns
            .flatMap(col => col.tasks)
            .find(t => t.id === active.id);

        if (task) {
            setActiveTask(task);
        }
    };

    const handleDragOver = (event: DragOverEvent) => {
        const { active, over } = event;
        if (!over) return;

        const activeId = active.id as string;
        const overId = over.id as string;

        // Find the columns
        const activeColumn = columns.find(col =>
            col.tasks.some(task => task.id === activeId)
        );
        const overColumn = columns.find(col =>
            col.id === overId || col.tasks.some(task => task.id === overId)
        );

        if (!activeColumn || !overColumn) return;

        // If moving to a different column
        if (activeColumn.id !== overColumn.id) {
            setColumns(prevColumns => {
                const activeColumnIndex = prevColumns.findIndex(col => col.id === activeColumn.id);
                const overColumnIndex = prevColumns.findIndex(col => col.id === overColumn.id);

                const activeTask = activeColumn.tasks.find(task => task.id === activeId);
                if (!activeTask) return prevColumns;

                // Remove from active column
                const newActiveColumn = {
                    ...prevColumns[activeColumnIndex],
                    tasks: prevColumns[activeColumnIndex].tasks.filter(task => task.id !== activeId),
                };

                // Add to over column
                const overTaskIndex = overColumn.tasks.findIndex(task => task.id === overId);
                const newOverColumn = {
                    ...prevColumns[overColumnIndex],
                    tasks: [
                        ...prevColumns[overColumnIndex].tasks.slice(0, overTaskIndex >= 0 ? overTaskIndex : prevColumns[overColumnIndex].tasks.length),
                        { ...activeTask, status: overColumn.status },
                        ...prevColumns[overColumnIndex].tasks.slice(overTaskIndex >= 0 ? overTaskIndex : prevColumns[overColumnIndex].tasks.length),
                    ],
                };

                const newColumns = [...prevColumns];
                newColumns[activeColumnIndex] = newActiveColumn;
                newColumns[overColumnIndex] = newOverColumn;

                return newColumns;
            });
        } else {
            // Reordering within the same column
            setColumns(prevColumns => {
                const columnIndex = prevColumns.findIndex(col => col.id === activeColumn.id);
                const column = prevColumns[columnIndex];

                const activeIndex = column.tasks.findIndex(task => task.id === activeId);
                const overIndex = column.tasks.findIndex(task => task.id === overId);

                if (activeIndex === -1 || overIndex === -1) return prevColumns;

                const newTasks = arrayMove(column.tasks, activeIndex, overIndex);
                const newColumn = { ...column, tasks: newTasks };

                const newColumns = [...prevColumns];
                newColumns[columnIndex] = newColumn;

                return newColumns;
            });
        }
    };

    const handleDragEnd = (event: DragEndEvent) => {
        const { active } = event;

        // Find the final column of the task
        const finalColumn = columns.find(col =>
            col.tasks.some(task => task.id === active.id)
        );

        if (finalColumn && onTaskMove) {
            onTaskMove(active.id as string, finalColumn.status);
        }

        setActiveTask(null);
    };

    return (
        <DndContext
            sensors={sensors}
            onDragStart={handleDragStart}
            onDragOver={handleDragOver}
            onDragEnd={handleDragEnd}
        >
            <div className="flex gap-4 h-full overflow-x-auto pb-4">
                {columns.map((column) => (
                    <KanbanColumn
                        key={column.id}
                        column={column}
                        onCardClick={onCardClick}
                    />
                ))}
            </div>

            <DragOverlay>
                {activeTask ? (
                    <div className="rotate-3 scale-105 opacity-90">
                        <KanbanCard task={activeTask} />
                    </div>
                ) : null}
            </DragOverlay>
        </DndContext>
    );
}
