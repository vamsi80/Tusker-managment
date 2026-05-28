"use client";

import type { TaskByIdType } from "@/server/services/task/tasks.service";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Calendar, Tag, User, FileCheck } from "lucide-react";
import { cn, formatIST } from "@/lib/utils";
import { getStatusColors, getStatusLabel } from "@/lib/colors/status-colors";
import { memo, useState, useEffect } from "react";

import { InlineAssigneePicker } from "@/components/task/shared/inline-assignee-picker";
import { useRemainingDays } from "@/hooks/use-due-date";
import { useParams } from "next/navigation";
import { useWorkspaceLayout } from "@/app/w/[workspaceId]/_components/workspace-layout-context";

interface SubtaskSheetHeaderProps {
    subTask: TaskByIdType;
    currentUserId?: string | null;
    members?: any[];
    onSubTaskAssigned?: (memberObj: { id: string; name: string | null; surname: string | null }) => void;
    onSubTaskUpdated?: (updatedTask: Partial<TaskByIdType>) => void;
    isAdmin?: boolean;
    isProjectManager?: boolean;
    tags?: { id: string; name: string; }[];
}

export const SubtaskSheetHeader = memo(function SubtaskSheetHeader({
    subTask,
    currentUserId,
    members = [],
    onSubTaskAssigned,
    onSubTaskUpdated,
    isAdmin,
    isProjectManager,
    tags = []
}: SubtaskSheetHeaderProps) {
    const [isExpanded, setIsExpanded] = useState(false);
    const params = useParams();
    const { data: workspaceData } = useWorkspaceLayout();

    const { remainingDays, isOverdue, dueDate } = useRemainingDays(
        subTask?.startDate ?? null,
        subTask?.days ?? null,
        subTask?.dueDate ?? null
    );

    if (!subTask) return null;

    // Get project name from workspace layout context using slug OR projectId
    const projectSlug = params.slug as string;
    const currentProject = workspaceData.projects?.find((p: any) => 
        (projectSlug && p.slug === projectSlug) || 
        (subTask.projectId && p.id === subTask.projectId)
    );
    const projectName = currentProject?.name || subTask.project?.name;

    // Assignee calculation
    const assignee = (subTask.assignee as any)?.workspaceMember?.user || subTask.assignee;

    return (
        <div className="px-4 sm:px-6 pt-6 pb-4 border-b flex-shrink-0">
            <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                    {/* Project & Parent Breadcrumb */}
                    {(projectName || subTask.parentTask) && (
                        <div className="mb-2.5 flex items-center gap-2 overflow-hidden">
                            {projectName && (
                                <Badge variant="secondary" className="bg-primary/10 text-primary border-none text-[10px] font-bold px-2 py-0.5 uppercase tracking-wider rounded-md shrink-0">
                                    {projectName}
                                </Badge>
                            )}
                            {subTask.parentTask && (
                                <div className="flex items-center gap-2 min-w-0">
                                    {projectName && <span className="text-muted-foreground/40 text-[10px] font-bold">/</span>}
                                    <span className="text-[10px] font-bold text-muted-foreground/60 uppercase tracking-widest truncate">
                                        {subTask.parentTask.name}
                                    </span>
                                </div>
                            )}
                        </div>
                    )}

                    <h2 className="text-xl sm:text-2xl font-medium break-words leading-tight text-foreground">
                        {subTask.name}
                    </h2>

                </div>


            </div>

            {/* Full-width Description Section */}
            {subTask.description && (
                <div className="mt-2">
                    <p className={cn(
                        "text-sm text-muted-foreground leading-relaxed",
                        !isExpanded && "line-clamp-3"
                    )}>
                        {typeof subTask.description === 'string' ? subTask.description : JSON.stringify(subTask.description)}
                    </p>
                    {String(subTask.description).length > 150 && (
                        <button
                            onClick={() => setIsExpanded(!isExpanded)}
                            className="text-xs font-semibold text-primary hover:underline mt-1 focus:outline-none"
                        >
                            {isExpanded ? "Show Less" : "Show More"}
                        </button>
                    )}
                </div>
            )}

            {/* Details Section - Scrollable to prevent header bloat */}
            <ScrollArea className="mt-4 max-h-[400px] -mx-1 px-1">
                <div className="space-y-6">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-10 gap-y-4">
                        {/* Column 1 */}
                        <div className="space-y-4">
                            {/* Assignee */}
                            <div className="flex items-center justify-between group">
                                <div className="flex items-center gap-2 text-muted-foreground">
                                    <User className="size-3.5" />
                                    <span className="text-[10px] font-bold uppercase tracking-tight">Assignee</span>
                                </div>
                                {assignee ? (
                                    <div className="flex items-center gap-1.5">
                                        <Avatar className="size-5 border border-background shadow-sm">
                                            <AvatarFallback className="text-[8px]">{assignee.surname?.[0]}</AvatarFallback>
                                        </Avatar>
                                        <span className="text-xs font-semibold">{assignee.surname || ""}</span>
                                    </div>
                                ) : (
                                    <InlineAssigneePicker
                                        subTask={subTask as any}
                                        members={members}
                                        projectId={subTask.projectId || ""}
                                        parentTaskId={subTask.parentTaskId || ""}
                                        canEdit={!!(isAdmin || isProjectManager || subTask.createdBy?.id === currentUserId || (subTask as any).createdById === currentUserId)}
                                        onAssigned={(_userId, member) => {
                                            onSubTaskAssigned?.({
                                                id: member.userId,
                                                name: member.user.name,
                                                surname: member.user.surname,
                                            });
                                        }}
                                    />
                                )}
                            </div>

                            {/* Status */}
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2 text-muted-foreground">
                                    <FileCheck className="size-3.5" />
                                    <span className="text-[10px] font-bold uppercase tracking-tight">Status</span>
                                </div>
                                {subTask.status ? (
                                    <Badge
                                        variant="outline"
                                        className={cn(
                                            "text-[9px] font-black px-1.5 py-0 leading-none h-4 uppercase",
                                            getStatusColors(subTask.status).color,
                                            getStatusColors(subTask.status).bgColor,
                                            getStatusColors(subTask.status).borderColor
                                        )}
                                    >
                                        {getStatusLabel(subTask.status)}
                                    </Badge>
                                ) : (
                                    <span className="text-[10px] font-medium text-muted-foreground italic">None</span>
                                )}
                            </div>

                            {/* Tags */}
                            <div className="flex flex-col gap-1.5 pt-1 border-t border-dashed border-border/50">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2 text-muted-foreground">
                                        <Tag className="size-3.5" />
                                        <span className="text-[10px] font-bold uppercase tracking-tight">Tags</span>
                                    </div>
                                    <div className="flex flex-wrap gap-1 justify-end max-w-[120px]">
                                        {subTask.tags && subTask.tags.length > 0 ? (
                                            subTask.tags.slice(0, 2).map(t => (
                                                <Badge key={t.id} variant="secondary" className="rounded-md text-[8px] font-bold bg-primary/5 text-primary border-none px-1 h-3.5">
                                                    {t.name}
                                                </Badge>
                                            ))
                                        ) : (
                                            <span className="text-[10px] text-muted-foreground italic">None</span>
                                        )}
                                        {subTask.tags && subTask.tags.length > 2 && (
                                            <span className="text-[8px] font-bold text-muted-foreground">+{subTask.tags.length - 2}</span>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Column 2 */}
                        <div className="space-y-4">
                            {/* Start Date */}
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2 text-muted-foreground">
                                    <Calendar className="size-3.5" />
                                    <span className="text-[10px] font-bold uppercase tracking-tight">Start Date</span>
                                </div>
                                <span className="text-xs font-bold">
                                    {subTask.startDate ? formatIST(subTask.startDate, "dd MMM yy") : "--"}
                                </span>
                            </div>

                            {/* Due Date */}
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2 text-muted-foreground">
                                    <Calendar className="size-3.5" />
                                    <span className="text-[10px] font-bold uppercase tracking-tight">Due Date</span>
                                </div>
                                <span className="text-xs font-bold">
                                    {dueDate ? formatIST(dueDate, "dd MMM yy") : "--"}
                                </span>
                            </div>

                            {/* Delayed By */}
                            {isOverdue && (
                                <div className="flex items-center justify-between pt-1 border-t border-dashed border-destructive/20">
                                    <div className="flex items-center gap-2 text-destructive">
                                        <Calendar className="size-3.5" />
                                        <span className="text-[10px] font-bold uppercase tracking-tight">Delayed</span>
                                    </div>
                                    <span className="text-xs font-black text-destructive animate-pulse">
                                        {Math.abs(remainingDays!)} Days
                                    </span>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </ScrollArea>
        </div>
    );
});
