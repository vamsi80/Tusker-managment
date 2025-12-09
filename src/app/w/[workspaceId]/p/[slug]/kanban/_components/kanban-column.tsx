"use client";

import { useDroppable } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { KanbanCard } from "./kanban-card";
import { KanbanColumn as KanbanColumnType, KanbanSubTask } from "./types";
import { cn } from "@/lib/utils";

interface KanbanColumnProps {
    column: KanbanColumnType;
    onCardClick?: (task: KanbanSubTask) => void;
}

export function KanbanColumn({ column, onCardClick }: KanbanColumnProps) {
    const { setNodeRef, isOver } = useDroppable({
        id: column.id,
    });

    return (
        <div className="flex flex-col h-full min-w-[320px] max-w-[320px]">
            <Card className={cn(
                "flex flex-col h-full transition-all duration-200",
                isOver && "ring-2 ring-primary ring-offset-2"
            )}>
                {/* Column Header */}
                <CardHeader className={cn(
                    "p-4 rounded-t-lg border-b-2",
                    column.bgColor
                )}>
                    <div className="flex items-center justify-between">
                        <h3 className={cn("font-semibold text-sm", column.color)}>
                            {column.title}
                        </h3>
                        <Badge
                            variant="secondary"
                            className={cn(
                                "ml-2 font-medium",
                                column.color,
                                "bg-white/80 dark:bg-gray-900/80"
                            )}
                        >
                            {column.tasks.length}
                        </Badge>
                    </div>
                </CardHeader>

                {/* Column Content */}
                <CardContent
                    ref={setNodeRef}
                    className={cn(
                        "flex-1 p-3 space-y-3 overflow-y-auto",
                        "scrollbar-thin scrollbar-thumb-gray-300 dark:scrollbar-thumb-gray-700 scrollbar-track-transparent",
                        isOver && "bg-primary/5"
                    )}
                >
                    <SortableContext
                        items={column.tasks.map(task => task.id)}
                        strategy={verticalListSortingStrategy}
                    >
                        {column.tasks.length === 0 ? (
                            <div className="flex items-center justify-center h-32 text-sm text-muted-foreground border-2 border-dashed rounded-lg">
                                Drop tasks here
                            </div>
                        ) : (
                            column.tasks.map((task) => (
                                <KanbanCard
                                    key={task.id}
                                    task={task}
                                    onClick={onCardClick}
                                />
                            ))
                        )}
                    </SortableContext>
                </CardContent>
            </Card>
        </div>
    );
}
