"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Calendar, Tag, GripVertical, Layers } from "lucide-react";
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

    // Calculate due date
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
        e.stopPropagation(); // Prevent drag from triggering
        onSubTaskClick?.(subTask);
    };

    return (
        <Card
            ref={setNodeRef}
            style={style}
            className={cn(
                "cursor-grab active:cursor-grabbing transition-shadow hover:shadow-md",
                (isDragging || isSortableDragging) && "opacity-50",
                "border-l-4",
                columnColor === "text-slate-700" && "border-l-slate-400",
                columnColor === "text-blue-700" && "border-l-blue-400",
                columnColor === "text-red-700" && "border-l-red-400",
                columnColor === "text-amber-700" && "border-l-amber-400",
                columnColor === "text-purple-700" && "border-l-purple-400",
                columnColor === "text-green-700" && "border-l-green-400"
            )}
            {...attributes}
            {...listeners}
        >
            <CardContent className="p-4 space-y-3">
                {/* Parent Task Badge */}
                {subTask.parentTask && (
                    <div className="flex items-center gap-1.5">
                        <Layers className="h-3 w-3 text-muted-foreground" />
                        <Badge
                            variant="outline"
                            className="text-xs px-2 py-0.5 bg-slate-100 text-slate-700 border-slate-300"
                        >
                            {subTask.parentTask.name}
                        </Badge>
                    </div>
                )}

                {/* Header with drag handle */}
                <div className="flex items-start justify-between gap-2">
                    <h4
                        className="font-medium text-sm leading-tight flex-1 line-clamp-2 cursor-pointer hover:text-blue-600 transition-colors"
                        onClick={handleNameClick}
                    >
                        {subTask.name}
                    </h4>
                    <GripVertical className="h-4 w-4 text-muted-foreground flex-shrink-0 mt-0.5" />
                </div>

                {/* Description */}
                {subTask.description && (
                    <p className="text-xs text-muted-foreground line-clamp-2">
                        {subTask.description}
                    </p>
                )}

                {/* Tag */}
                {subTask.tag && (
                    <div className="flex items-center gap-1.5">
                        <Tag className="h-3 w-3 text-muted-foreground" />
                        <Badge
                            variant="secondary"
                            className={cn(
                                "text-xs px-2 py-0.5",
                                subTask.tag === "DESIGN" && "bg-purple-100 text-purple-700 border-purple-200",
                                subTask.tag === "PROCUREMENT" && "bg-orange-100 text-orange-700 border-orange-200",
                                subTask.tag === "CONTRACTOR" && "bg-cyan-100 text-cyan-700 border-cyan-200"
                            )}
                        >
                            {subTask.tag}
                        </Badge>
                    </div>
                )}

                {/* Due Date */}
                {dueDate && (
                    <div className="flex items-center gap-1.5">
                        <Calendar className="h-3 w-3 text-muted-foreground" />
                        <span
                            className={cn(
                                "text-xs",
                                isOverdue ? "text-red-600 font-medium" : "text-muted-foreground"
                            )}
                        >
                            {dueDate.toLocaleDateString("en-GB")}
                            {isOverdue && " (Overdue)"}
                        </span>
                    </div>
                )}

                {/* Footer: Assignee */}
                <div className="flex items-center gap-2 pt-2 border-t">
                    {assignee ? (
                        <>
                            <Avatar className="h-6 w-6">
                                <AvatarImage src={assignee.image || ""} />
                                <AvatarFallback className="text-[10px]">
                                    {assignee.name?.[0]}
                                </AvatarFallback>
                            </Avatar>
                            <span className="text-xs text-muted-foreground">
                                {assignee.name}
                            </span>
                        </>
                    ) : (
                        <span className="text-xs text-muted-foreground italic">Unassigned</span>
                    )}
                </div>
            </CardContent>
        </Card>
    );
}
