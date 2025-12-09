"use client";

import { useState } from "react";
import { KanbanBoard } from "./_components/kanban-board";
import { sampleKanbanData } from "./_components/sample-data";
import { KanbanSubTask } from "./_components/types";
import { toast } from "sonner";

export default function KanbanPage() {
    const [selectedTask, setSelectedTask] = useState<KanbanSubTask | null>(null);

    const handleTaskMove = (taskId: string, newStatus: KanbanSubTask['status']) => {
        console.log(`Task ${taskId} moved to ${newStatus}`);
        toast.success(`Task moved to ${newStatus.replace('_', ' ')}`);

        // TODO: Call API to update task status
        // await updateTaskStatus(taskId, newStatus);
    };

    const handleCardClick = (task: KanbanSubTask) => {
        setSelectedTask(task);
        console.log('Card clicked:', task);

        // TODO: Open task details sheet/modal
        // You can integrate with your existing SubTaskDetailsSheet component
    };

    return (
        <div className="flex flex-col h-[calc(100vh-4rem)] p-6 bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-950 dark:to-gray-900">
            {/* Header */}
            <div className="mb-6">
                <h1 className="text-3xl font-bold bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent">
                    Kanban Board
                </h1>
                <p className="text-muted-foreground mt-1">
                    Drag and drop tasks to update their status
                </p>
            </div>

            {/* Kanban Board */}
            <div className="flex-1 overflow-hidden">
                <KanbanBoard
                    columns={sampleKanbanData}
                    onTaskMove={handleTaskMove}
                    onCardClick={handleCardClick}
                />
            </div>
        </div>
    );
}