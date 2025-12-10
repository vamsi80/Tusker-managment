"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Calendar, Tag, GripVertical, MessageSquare, AlertCircle } from "lucide-react";
import { AllSubTaskType } from "@/app/data/task/get-project-tasks";
import { cn } from "@/lib/utils";

interface KanbanCardProps {
    subTask: AllSubTaskType[number];
    columnColor: string;
    isDragging?: boolean;
    onSubTaskClick?: (subTask: AllSubTaskType[number]) => void;
}

export function KanbanCard({ subTask, columnColor, isDragging = false, onSubTaskClick }: KanbanCardProps) {
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging: isSortableDragging,
    } = useSortable({
        id: subTask.id,
    });

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
    };

    const assignee = subTask.assignee?.workspaceMember?.user;
    const reviewCount = (subTask as any)._count?.reviewComments || 0;

    const calculateDueDate = () => {
        if (!subTask.startDate || !subTask.days) return null;
        const start = new Date(subTask.startDate);
        const due = new Date(start);
        due.setDate(due.getDate() + subTask.days);
        return due;
    };

    const dueDate = calculateDueDate();
    const isOverdue = dueDate && new Date() > dueDate;

    const handleNameClick = (e: React.MouseEvent) => {
        e.stopPropagation();
        onSubTaskClick?.(subTask);
    };

    return (
        <Card
            ref={setNodeRef}
            style={style}
            className={cn(
                "h-auto py-0 cursor-grab active:cursor-grabbing transition-all hover:shadow-lg dark:hover:shadow-primary/20",
                (isDragging || isSortableDragging) && "opacity-50 shadow-xl",
                "border-l-4 overflow-hidden",
                columnColor === "text-slate-700" && "border-l-slate-500 dark:border-l-slate-400",
                columnColor === "text-blue-700" && "border-l-blue-500 dark:border-l-blue-400",
                columnColor === "text-red-700" && "border-l-red-500 dark:border-l-red-400",
                columnColor === "text-amber-700" && "border-l-amber-500 dark:border-l-amber-400",
                columnColor === "text-purple-700" && "border-l-purple-500 dark:border-l-purple-400",
                columnColor === "text-green-700" && "border-l-green-500 dark:border-l-green-400"
            )}
            {...attributes}
            {...listeners}
        >
            <CardContent className="p-3 space-y-4">
                <div className="flex items-center gap-1.5">
                    {subTask.parentTask && (
                        <Badge
                            variant="outline"
                            className="text-xs px-2 py-0.5 max-w-[140px] truncate"
                        >
                            {subTask.parentTask.name}
                        </Badge>
                    )}
                </div>

                <div>
                    <div className="flex items-start justify-between gap-2">
                        <h4
                            className="font-semibold text-sm leading-tight flex-1 line-clamp-2 cursor-pointer hover:text-primary transition-colors"
                            onClick={handleNameClick}
                        >
                            {subTask.name}
                        </h4>
                        <GripVertical className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                    </div>
                    {subTask.description && (
                        <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">
                            {subTask.description}
                        </p>
                    )}
                </div>

                {assignee && (
                    <div className="flex items-center gap-2">
                        <span className="text-xs font-medium text-muted-foreground flex-1">
                            Assignee:
                        </span>
                        <TooltipProvider>
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <Avatar className="h-6 w-6 ring-2 ring-background cursor-pointer">
                                        <AvatarImage src={assignee.image || ""} />
                                        <AvatarFallback className="text-[10px] font-semibold bg-primary text-primary-foreground">
                                            {assignee.name?.[0]}
                                        </AvatarFallback>
                                    </Avatar>
                                </TooltipTrigger>
                                <TooltipContent>
                                    <p>{assignee.surname}</p>
                                </TooltipContent>
                            </Tooltip>
                        </TooltipProvider>
                    </div>
                )}

                <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1">
                        <Calendar className="h-3 w-3 text-muted-foreground" />
                        {subTask.startDate ? (
                            <span className="text-[10px] font-medium text-muted-foreground">
                                {new Date(subTask.startDate).toLocaleDateString("en-GB", {
                                    day: '2-digit',
                                    month: 'short'
                                })}
                            </span>
                        ) : (
                            <span className="text-[10px] text-muted-foreground italic">No date</span>
                        )}
                    </div>

                    {subTask.tag && (
                        <div className="flex items-center gap-1">
                            <Tag className="h-2.5 w-2.5 text-muted-foreground" />
                            <span
                                className={cn(
                                    "text-[10px] font-medium text-muted-foreground"
                                )}
                            >
                                {subTask.tag}
                            </span>
                        </div>
                    )}
                </div>

                <div className="flex items-center justify-between pt-2 border-t">
                    <div className="flex items-center gap-1.5">
                        <MessageSquare className="h-3.5 w-3.5 text-muted-foreground" />
                        <span className="text-xs text-muted-foreground">
                            {reviewCount > 0 ? (
                                <span className="font-semibold">
                                    {reviewCount} Review{reviewCount !== 1 ? 's' : ''}
                                </span>
                            ) : (
                                <span className="italic">No reviews</span>
                            )}
                        </span>
                    </div>

                    {dueDate && (
                        <div
                            className={cn(
                                "flex items-center gap-1 text-[10px] font-medium",
                                isOverdue
                                    ? "text-destructive dark:text-red-400"
                                    : "text-muted-foreground"
                            )}
                        >
                            <span>
                                Due: {dueDate.toLocaleDateString("en-GB", {
                                    day: '2-digit',
                                    month: 'short'
                                })}
                            </span>
                            {isOverdue && <AlertCircle className="h-3 w-3" />}
                        </div>
                    )}
                </div>
            </CardContent>
        </Card>
    );
}
