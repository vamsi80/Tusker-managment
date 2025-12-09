"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Calendar, MessageSquare, Clock, AlertCircle } from "lucide-react";
import { KanbanSubTask } from "./types";
import { cn } from "@/lib/utils";

interface KanbanCardProps {
    task: KanbanSubTask;
    onClick?: (task: KanbanSubTask) => void;
}

export function KanbanCard({ task, onClick }: KanbanCardProps) {
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging,
    } = useSortable({
        id: task.id,
    });

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
    };

    // Calculate due date
    const calculateDueDate = () => {
        if (!task.startDate || !task.days) return null;
        const start = new Date(task.startDate);
        const due = new Date(start);
        due.setDate(due.getDate() + task.days);
        return due;
    };

    // Calculate if overdue
    const isOverdue = () => {
        const dueDate = calculateDueDate();
        if (!dueDate) return false;
        return dueDate < new Date() && task.status !== 'COMPLETED' && task.status !== 'CANCELED';
    };

    const dueDate = calculateDueDate();
    const overdue = isOverdue();

    // Get tag color
    const getTagColor = () => {
        switch (task.tag) {
            case 'DESIGN':
                return 'bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300';
            case 'PROCUREMENT':
                return 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300';
            case 'CONTRACTOR':
                return 'bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300';
            default:
                return 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300';
        }
    };

    return (
        <Card
            ref={setNodeRef}
            style={style}
            {...attributes}
            {...listeners}
            className={cn(
                "group cursor-grab active:cursor-grabbing transition-all duration-200 hover:shadow-lg",
                isDragging && "opacity-50 shadow-2xl scale-105 rotate-2",
                "border-l-4",
                task.status === 'BLOCKED' && "border-l-red-500",
                task.status === 'IN_PROGRESS' && "border-l-blue-500",
                task.status === 'REVIEW' && "border-l-yellow-500",
                task.status === 'COMPLETED' && "border-l-green-500",
                task.status === 'TO_DO' && "border-l-gray-400",
                task.status === 'CANCELED' && "border-l-gray-300"
            )}
            onClick={() => onClick?.(task)}
        >
            <CardHeader className="p-3 pb-2">
                <div className="flex items-start justify-between gap-2">
                    <h4 className="text-sm font-semibold line-clamp-2 flex-1 group-hover:text-primary transition-colors">
                        {task.name}
                    </h4>
                    {task.assignee && (
                        <Avatar className="h-6 w-6 flex-shrink-0 ring-2 ring-background">
                            <AvatarImage src={task.assignee.image} />
                            <AvatarFallback className="text-[10px]">
                                {task.assignee.name[0]}{task.assignee.surname?.[0]}
                            </AvatarFallback>
                        </Avatar>
                    )}
                </div>

                {task.description && (
                    <p className="text-xs text-muted-foreground line-clamp-2 mt-1">
                        {task.description}
                    </p>
                )}
            </CardHeader>

            <CardContent className="p-3 pt-0 space-y-2">
                {/* Tags and Badges */}
                <div className="flex flex-wrap gap-1.5">
                    {task.tag && (
                        <Badge variant="secondary" className={cn("text-[10px] px-1.5 py-0.5", getTagColor())}>
                            {task.tag}
                        </Badge>
                    )}
                    {task.parentTaskName && (
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0.5">
                            {task.parentTaskName}
                        </Badge>
                    )}
                </div>

                {/* Footer Info */}
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <div className="flex items-center gap-2">
                        {dueDate && (
                            <div className={cn(
                                "flex items-center gap-1",
                                overdue && "text-red-600 dark:text-red-400 font-medium"
                            )}>
                                {overdue ? (
                                    <AlertCircle className="h-3 w-3" />
                                ) : (
                                    <Calendar className="h-3 w-3" />
                                )}
                                <span>{dueDate.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}</span>
                            </div>
                        )}
                        {task.days && (
                            <div className="flex items-center gap-1">
                                <Clock className="h-3 w-3" />
                                <span>{task.days}d</span>
                            </div>
                        )}
                    </div>

                    {task.commentCount !== undefined && task.commentCount > 0 && (
                        <div className="flex items-center gap-1">
                            <MessageSquare className="h-3 w-3" />
                            <span>{task.commentCount}</span>
                        </div>
                    )}
                </div>
            </CardContent>
        </Card>
    );
}
