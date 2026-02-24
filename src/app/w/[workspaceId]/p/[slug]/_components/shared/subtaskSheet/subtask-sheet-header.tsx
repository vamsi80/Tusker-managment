"use client";

import { TaskByIdType } from "@/data/task/get-task-by-id";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Calendar, Tag, User, FileCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import { getStatusColors, getStatusLabel } from "@/lib/colors/status-colors";

interface SubtaskSheetHeaderProps {
    subTask: TaskByIdType;
}

/**
 * Subtask Sheet Header Component
 * 
 * Displays:
 * - Task title and description
 * - Assignee information
 * - Due date
 * - Tag
 * - Status badge
 */
export function SubtaskSheetHeader({ subTask }: SubtaskSheetHeaderProps) {
    // Assignee is directly on the task object (user fields) in both SubTaskType and TaskByIdType
    // But we handle potential workspaceMember nesting just in case legacy types are passed
    const assignee = (subTask.assignee as any)?.workspaceMember?.user || subTask.assignee;

    return (
        <div className="px-4 sm:px-6 pt-6 pb-4 border-b flex-shrink-0">
            <div className="flex items-start justify-between">
                <div className="flex-1">
                    <h2 className="text-xl sm:text-2xl font-semibold break-words">
                        {subTask.name}
                    </h2>
                    <p className="mt-1 text-xs sm:text-sm text-muted-foreground">
                        Subtask Details & Activity
                    </p>
                </div>
            </div>

            {/* Details Section */}
            <ScrollArea className="mt-6 max-h-[200px]">
                <div className="space-y-4">
                    <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                        Details
                    </h3>

                    {/* Assignee */}
                    <div className="flex items-center gap-2 sm:gap-3">
                        <User className="h-4 w-4 text-muted-foreground shrink-0" />
                        <span className="text-xs sm:text-sm font-medium w-20 sm:w-24 shrink-0">Assignee</span>
                        {assignee ? (
                            <div className="flex items-center gap-2 min-w-0">
                                <Avatar className="h-6 w-6 shrink-0">
                                    <AvatarImage src={assignee.image || ""} />
                                    <AvatarFallback>{assignee.name?.[0]}</AvatarFallback>
                                </Avatar>
                                <span className="text-xs sm:text-sm truncate">{assignee.name} {assignee.surname || ""}</span>
                            </div>
                        ) : (
                            <span className="text-xs sm:text-sm text-muted-foreground">Unassigned</span>
                        )}
                    </div>

                    {/* Due Date */}
                    <div className="flex items-center gap-2 sm:gap-3">
                        <Calendar className="h-4 w-4 text-muted-foreground shrink-0" />
                        <span className="text-xs sm:text-sm font-medium w-20 sm:w-24 shrink-0">Due Date</span>
                        {subTask.startDate ? (
                            <span className="text-xs sm:text-sm">
                                {new Date(subTask.startDate).toLocaleDateString('en-GB')}
                            </span>
                        ) : (
                            <span className="text-xs sm:text-sm text-muted-foreground">No due date</span>
                        )}
                    </div>

                    {/* Tag */}
                    <div className="flex items-center gap-2 sm:gap-3">
                        <Tag className="h-4 w-4 text-muted-foreground shrink-0" />
                        <span className="text-xs sm:text-sm font-medium w-20 sm:w-24 shrink-0">Tag</span>
                        {subTask.tag ? (
                            <Badge variant="secondary" className="rounded-md text-[10px] sm:text-xs">
                                {typeof subTask.tag === 'string' ? subTask.tag : subTask.tag.name}
                            </Badge>
                        ) : (
                            <span className="text-xs sm:text-sm text-muted-foreground">No tag</span>
                        )}
                    </div>

                    {/* Status */}
                    <div className="flex items-center gap-2 sm:gap-3">
                        <FileCheck className="h-4 w-4 text-muted-foreground shrink-0" />
                        <span className="text-xs sm:text-sm font-medium w-20 sm:w-24 shrink-0">Status</span>
                        {subTask.status ? (
                            <Badge
                                variant="outline"
                                className={cn(
                                    "text-[10px] sm:text-xs font-medium",
                                    getStatusColors(subTask.status).color,
                                    getStatusColors(subTask.status).bgColor,
                                    getStatusColors(subTask.status).borderColor
                                )}
                            >
                                {getStatusLabel(subTask.status)}
                            </Badge>
                        ) : (
                            <span className="text-xs sm:text-sm text-muted-foreground">No status</span>
                        )}
                    </div>
                </div>
            </ScrollArea>
        </div>
    );
}
