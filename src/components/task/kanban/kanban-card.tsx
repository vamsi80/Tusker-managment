"use client";

import { useState, useEffect } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Calendar, Tag, GripVertical, MessageSquare, AlertCircle, Folder, Crown } from "lucide-react";
import { KanbanSubTaskType } from "@/data/task";
import { cn } from "@/lib/utils";
import { getColorFromString } from "@/lib/colors/project-colors";

/**
 * KanbanCard Component
 * ...
 */
interface KanbanCardProps {
    subTask: KanbanSubTaskType;
    columnColor: string;
    isDragging?: boolean;
    onSubTaskClick?: (subTask: KanbanSubTaskType) => void;
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
        disabled: isDragging, // Disable sortable logic when rendered in DragOverlay
    });

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
    };

    const assignee = subTask.assignee;
    const reviewCount = (subTask as any)._count?.reviewComments || 0;

    // Get Project Manager specifically
    const project = subTask.project;
    const pmMember = project?.projectMembers?.find((m: any) => m.projectRole === "PROJECT_MANAGER");
    const projectManager = pmMember?.workspaceMember?.user;

    const [isMounted, setIsMounted] = useState(false);
    useEffect(() => {
        setIsMounted(true);
    }, []);

    const dueDate = subTask.dueDate ? new Date(subTask.dueDate) : (() => {
        if (!subTask.startDate || !subTask.days) return null;
        const start = new Date(subTask.startDate);
        const due = new Date(start);
        due.setDate(due.getDate() + subTask.days);
        return due;
    })();

    const isOverdue = isMounted && dueDate && new Date() > dueDate;

    const handleNameClick = (e: React.MouseEvent) => {
        e.stopPropagation();
        onSubTaskClick?.(subTask);
    };

    return (
        <Card
            ref={setNodeRef}
            style={style}
            className={cn(
                "h-auto py-0 transition-all hover:shadow-lg dark:hover:shadow-primary/20",
                (isDragging || isSortableDragging) && "opacity-50 shadow-xl",
                "border-l-4 overflow-hidden",
                columnColor === "text-slate-700" && "border-l-slate-500 dark:border-l-slate-400",
                columnColor === "text-blue-700" && "border-l-blue-500 dark:border-l-blue-400",
                columnColor === "text-red-700" && "border-l-red-500 dark:border-l-red-400",
                columnColor === "text-amber-700" && "border-l-amber-500 dark:border-l-amber-400",
                columnColor === "text-purple-700" && "border-l-purple-500 dark:border-l-purple-400",
                columnColor === "text-green-700" && "border-l-green-500 dark:border-l-green-400"
            )}
        >
            <CardContent className="p-3 space-y-3">
                <div className="flex items-center justify-between text-[10px] text-muted-foreground pb-2 border-b border-border/50">
                    <div className="flex items-center gap-1.5 truncate max-w-[70%]" title={project?.name}>
                        <div
                            className="h-2 w-2 rounded-full border shadow-sm shrink-0"
                            style={{ backgroundColor: project?.color || getColorFromString(project?.name || "") }}
                        />
                        <span className="truncate font-medium">{project?.name}</span>
                    </div>
                    {pmMember && projectManager && (
                        <TooltipProvider>
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <div className="flex items-center shrink-0 ml-auto rounded-full bg-amber-50/50 dark:bg-amber-950/30 border border-amber-100/50 dark:border-amber-900/50 hover:bg-amber-100 transition-colors cursor-default">
                                        <Avatar className="h-4 w-4 border border-amber-200 dark:border-amber-800 shadow-sm">
                                            <AvatarImage src={projectManager.image || ""} />
                                            <AvatarFallback className="text-[8px] bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300">
                                                {(projectManager.surname?.[0] || projectManager.name?.[0])}
                                            </AvatarFallback>
                                        </Avatar>
                                    </div>
                                </TooltipTrigger>
                                <TooltipContent side="left" className="text-xs">
                                    <p className="font-semibold">Project Manager</p>
                                    <p>{projectManager.surname || projectManager.name}</p>
                                </TooltipContent>
                            </Tooltip>
                        </TooltipProvider>
                    )}
                </div>

                <div>
                    {subTask.parentTask && (
                        <div className="flex items-center gap-1 mb-1 group/parent cursor-default">
                            <span className="text-[11px] font-medium text-muted-foreground/80 truncate max-w-[180px]" title={`Parent: ${subTask.parentTask.name}`}>
                                {subTask.parentTask.name}
                            </span>
                            <span className="text-[10px] text-muted-foreground/40">/</span>
                        </div>
                    )}
                    <div className="flex items-start justify-between gap-2 z-30">
                        <h5
                            className="font-semibold text-[13px] leading-snug flex-1 cursor-pointer hover:text-primary transition-colors line-clamp-1"
                            onClick={handleNameClick}
                            title={subTask.name}
                        >
                            {subTask.name}
                        </h5>
                        <div
                            {...attributes}
                            {...listeners}
                            onContextMenu={(e) => e.preventDefault()}
                            className="cursor-grab active:cursor-grabbing p-3 -m-3 touch-none z-20 flex items-center justify-center min-w-[32px] min-h-[32px]"
                        >
                            <GripVertical className="h-4 w-4 text-muted-foreground/40" />
                        </div>
                    </div>
                    {/* {subTask.description && (
                        <p className="text-xs text-muted-foreground line-clamp-1 mt-1 leading-relaxed">
                            {subTask.description}
                        </p>
                    )} */}
                </div>



                <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1">
                        {subTask.startDate && (
                            <>
                                <Calendar className="h-3 w-3 text-muted-foreground" />
                                <span className="text-[10px] font-medium text-muted-foreground">
                                    {new Date(subTask.startDate).toLocaleDateString("en-GB", {
                                        day: '2-digit',
                                        month: 'short'
                                    })}
                                </span>
                            </>
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
                                {subTask.tag.name}
                            </span>
                        </div>
                    )}
                </div>

                <div className="flex items-center justify-between pt-1 border-t mt-auto">
                    <div className="flex items-center gap-3">
                        <div className="flex items-center gap-1.5 text-muted-foreground" title="Reviews">
                            <MessageSquare className="h-3.5 w-3.5" />
                            <span className="text-xs font-medium">{reviewCount}</span>
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
                                <Calendar className="h-3 w-3" />
                                <span>
                                    {new Date(dueDate).toLocaleDateString("en-GB", {
                                        day: '2-digit',
                                        month: 'short'
                                    })}
                                </span>
                                {isOverdue && <AlertCircle className="h-3 w-3" />}
                            </div>
                        )}
                    </div>

                    {assignee && (
                        <TooltipProvider>
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <Avatar className="h-6 w-6 cursor-pointer border-2 border-background">
                                        <AvatarImage src={assignee.image || ""} />
                                        <AvatarFallback className="text-[10px]">{assignee.surname?.[0] || assignee.name?.[0]}</AvatarFallback>
                                    </Avatar>
                                </TooltipTrigger>
                                <TooltipContent side="left">
                                    <p>Assignee: {assignee.surname || assignee.name}</p>
                                </TooltipContent>
                            </Tooltip>
                        </TooltipProvider>
                    )}
                </div>
            </CardContent>
        </Card>
    );
}
