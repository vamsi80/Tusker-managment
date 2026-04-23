"use client";

import React, { useState } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

import { Card, CardContent } from "@/components/ui/card";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  MoreHorizontal,
  Edit,
  Trash2,
  MessageSquare,
  Calendar,
  AlertCircle,
  Tag,
} from "lucide-react";
import type { KanbanSubTaskType } from "@/data/task";
import { cn, formatIST } from "@/lib/utils";
import { getColorFromString } from "@/lib/colors/project-colors";
import { UserPermissionsType } from "@/data/user/get-user-permissions";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { EditSubTaskForm } from "@/app/w/[workspaceId]/p/[slug]/_components/forms/edit-subtask-form";
import { DeleteSubTaskForm } from "@/app/w/[workspaceId]/p/[slug]/_components/forms/delete-subtask-form";
import { InlineAssigneePicker } from "@/components/task/shared/inline-assignee-picker";
import { ProjectOption } from "../shared/types";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { COLUMNS, TaskStatus } from "./kanban-board";


interface KanbanCardProps {
  subTask: KanbanSubTaskType;
  columnColor: string;
  isDragging?: boolean;
  onSubTaskClick?: (subTask: KanbanSubTaskType) => void;
  projectManagers?: Record<string, any>;
  isUpdating?: boolean;
  permissions?: UserPermissionsType;
  userId?: string;
  onUpdateInPlace?: (subTaskId: string, data: any) => void;
  projectMembers?: any[];
  projects?: ProjectOption[];
  projectMap?: Record<string, ProjectOption>;

  isMobile?: boolean;
  onStatusChange?: (subTaskId: string, newStatus: TaskStatus, currentStatus: TaskStatus) => void;
}

export const KanbanCard = React.memo(function KanbanCard({
  subTask,
  columnColor,
  isDragging = false,
  onSubTaskClick,
  projectManagers,
  isUpdating,
  permissions,
  userId,
  onUpdateInPlace,
  projectMembers = [],
  projects,
  projectMap,
  isMobile = false,
  onStatusChange,
}: KanbanCardProps) {
  const [isStatusDrawerOpen, setIsStatusDrawerOpen] = useState(false);
  const longPressTimer = React.useRef<NodeJS.Timeout | null>(null);

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging: isSortableDragging,
  } = useSortable({
    id: subTask.id,
    disabled: isDragging || isMobile, // Disable sortable logic when rendered in DragOverlay or on Mobile
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const assigneeUser = subTask.assignee;
  const activityCount = (subTask as any)._count?.activities || 0;

  // Resolve project metadata: Priority to explicit object, then lookup from map
  const project = subTask.project || (subTask.projectId && projectMap ? projectMap[subTask.projectId] : null);

  // Get Project Managers from the hoisted map (effective way)
  const assignedManagers = (
    projectManagers && subTask.projectId
      ? projectManagers[subTask.projectId] || []
      : []
  ) as any[];
  const firstManager = assignedManagers?.[0] || null;

  // 🚀 Speculative Pre-fetching for "Instant" feel
  const handlePrefetch = () => {
    if (!subTask?.id) return;
  };

  const canEdit = () => {
    const creatorId =
      subTask.createdBy?.id ||
      (subTask as any).createdById;

    if (permissions) {
      return (
        permissions.isWorkspaceAdmin ||
        permissions.isProjectManager ||
        (permissions.isProjectLead && creatorId === userId)
      );
    }
    return false;
  };

  const dueDate = subTask.dueDate
    ? new Date(subTask.dueDate)
    : (() => {
      if (!subTask.startDate || !subTask.days) return null;
      const start = new Date(subTask.startDate);
      const due = new Date(start);
      due.setDate(due.getDate() + subTask.days);
      return due;
    })();

  const isOverdue = dueDate && new Date() > dueDate;

  const handleNameClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    // Inject project metadata if it's missing but we have it in our map
    const subTaskWithMetadata = {
      ...subTask,
      project: subTask.project || project
    };
    onSubTaskClick?.(subTaskWithMetadata as any);
  };

  return (
    <>
      <Card
        ref={setNodeRef}
        style={style}
        className={cn(
          "h-auto py-0 transition-shadow duration-200 hover:shadow-lg dark:hover:shadow-primary/20",
          (isDragging || isSortableDragging) && "opacity-50 shadow-xl",
          "border-l-4 overflow-hidden",
          (!assigneeUser && subTask.status !== "COMPLETED" && subTask.status !== "CANCELLED") && "bg-red-50 dark:bg-red-950/20 shadow-[0_0_8px_rgba(239,68,68,0.2)] animate-[pulse_2s_infinite] border-red-400 dark:border-red-600",
          columnColor === "text-slate-600" &&
          "border-l-[#D1D5DB] dark:border-l-[#D1D5DB]/80",
          columnColor === "text-[#3B82F6]" &&
          "border-l-[#3B82F6] dark:border-l-[#3B82F6]/80",
          columnColor === "text-[#EF4444]" &&
          "border-l-[#EF4444] dark:border-l-[#EF4444]/80",
          columnColor === "text-[#F59E0B]" &&
          "border-l-[#F59E0B] dark:border-l-[#F59E0B]/80",
          columnColor === "text-[#8B5CF6]" &&
          "border-l-[#8B5CF6] dark:border-l-[#8B5CF6]/80",
          columnColor === "text-[#22C55E]" &&
          "border-l-[#22C55E] dark:border-l-[#22C55E]/80",
        )}
        onMouseEnter={handlePrefetch}
        onClick={(e) => {
          e.stopPropagation();
          onSubTaskClick?.(subTask);
        }}
        onTouchStart={() => {
          if (!isMobile) return;
          longPressTimer.current = setTimeout(() => {
            setIsStatusDrawerOpen(true);
          }, 500);
        }}
        onTouchEnd={() => {
          if (longPressTimer.current) {
            clearTimeout(longPressTimer.current);
            longPressTimer.current = null;
          }
        }}
        onTouchMove={() => {
          if (longPressTimer.current) {
            clearTimeout(longPressTimer.current);
            longPressTimer.current = null;
          }
        }}
      >
        <CardContent className="p-3 space-y-3">
          <div
            {...(isMobile ? {} : attributes)}
            {...(isMobile ? {} : listeners)}
            className={cn(
              "flex items-center justify-between text-[10px] text-muted-foreground pb-2 border-b border-border/50",
              isMobile ? "cursor-default" : "cursor-grab active:cursor-grabbing touch-none"
            )}
          >
            <div className="flex flex-1 items-center gap-1 min-w-0 mr-2">
              <div
                className="flex items-center gap-1.5 shrink-0 max-w-[45%]"
                title={`Project: ${project?.name}`}
              >
                <div
                  className="h-2 w-2 rounded-full border shadow-sm shrink-0"
                  style={{
                    backgroundColor:
                      project?.color || getColorFromString(project?.name || ""),
                  }}
                />
                <span className="truncate font-medium">{project?.name}</span>
              </div>

              {subTask.parentTask && (
                <div className="flex items-center gap-1 min-w-0">
                  <span className="text-muted-foreground/40 shrink-0">/</span>
                  <span
                    className="truncate text-[10px] font-medium text-muted-foreground/80"
                    title={`Parent: ${subTask.parentTask.name}`}
                  >
                    {subTask.parentTask.name}
                  </span>
                </div>
              )}
            </div>

            {assignedManagers.length > 0 && (
              <div className="flex items-center gap-1.5 ml-auto">
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div className="flex items-center rounded-full bg-amber-50/50 dark:bg-amber-950/30 border border-amber-100/50 dark:border-amber-900/50 hover:bg-amber-100 transition-colors cursor-default">
                        <Avatar className="h-4 w-4 border border-amber-200 dark:border-amber-800 shadow-sm">
                          <AvatarFallback className="text-[8px] bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300">
                            {(firstManager?.surname || firstManager?.user?.surname)?.[0]?.toUpperCase() || "?"}
                          </AvatarFallback>
                        </Avatar>
                      </div>
                    </TooltipTrigger>
                    <TooltipContent
                      side="left"
                      className="text-xs p-2 space-y-0.5"
                    >
                      <div className="pb-1.5 border-b">
                        <p className="font-semibold text-[10px] uppercase tracking-wider">
                          Project
                        </p>
                        <p className="font-medium text-[11px] text-primary">
                          {project?.name}
                        </p>
                      </div>
                      {subTask.parentTask && (
                        <div className="pb-1.5 border-b">
                          <p className="font-semibold text-[10px] uppercase tracking-wider">
                            Parent Task
                          </p>
                          <p className="font-medium text-[11px] text-primary">
                            {subTask.parentTask.name}
                          </p>
                        </div>
                      )}
                      <div>
                        <p className="font-semibold text-[10px] uppercase tracking-wider">
                          Project Manager
                        </p>
                        {firstManager && (
                          <p className="font-medium text-[11px] text-primary">
                            {firstManager.surname}
                          </p>
                        )}
                      </div>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
            )}
          </div>

          <div className="space-y-0">
            <div className="flex items-start justify-between gap-2 z-30">
              <h5
                className="font-semibold text-[13px] leading-snug flex-1 cursor-pointer hover:text-primary transition-colors line-clamp-1"
                onClick={handleNameClick}
                onMouseEnter={() => {
                  import(
                    "@/app/w/[workspaceId]/p/[slug]/_components/shared/subtaskSheet/subtask-details-sheet"
                  ).then((m) => {
                    m.prefetchSubTask(subTask.id);
                  });
                }}
                title={subTask.name}
              >
                {subTask.name}
              </h5>

              {canEdit() && (
                <div onClick={(e) => e.stopPropagation()}>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 -mr-1 opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <MoreHorizontal className="h-3.5 w-3.5 text-muted-foreground" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-40">
                      <DropdownMenuItem
                        asChild
                        onSelect={(e) => e.preventDefault()}
                      >
                        <EditSubTaskForm
                          subTask={subTask as any}
                          projectId={subTask.projectId}
                          parentTaskId={subTask.parentTaskId!}
                          members={projectMembers}
                          onSubTaskUpdated={(data) =>
                            onUpdateInPlace?.(subTask.id, data)
                          }
                          trigger={
                            <div className="flex items-center gap-2 w-full px-2 py-1.5 cursor-pointer hover:bg-accent rounded-sm transition-colors text-xs">
                              <Edit className="h-3.5 w-3.5" />
                              <span>Edit</span>
                            </div>
                          }
                        />
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        asChild
                        onSelect={(e) => e.preventDefault()}
                      >
                        <DeleteSubTaskForm
                          subTask={subTask as any}
                          onSubTaskDeleted={() => {
                            // In Kanban, board state usually handles this via cache invalidation
                            // but we might want a local filter if we're feeling optimistic
                            window.location.reload();
                          }}
                          trigger={
                            <div className="flex items-center gap-2 w-full px-2 py-1.5 cursor-pointer hover:bg-destructive/10 text-destructive rounded-sm transition-colors text-xs">
                              <Trash2 className="h-3.5 w-3.5" />
                              <span>Delete</span>
                            </div>
                          }
                        />
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center justify-between pt-1 border-t mt-auto">
            <div className="flex items-center gap-3">
              <div
                className="flex items-center gap-1.5 text-muted-foreground"
                title="Reviews"
              >
                <MessageSquare className="h-3.5 w-3.5" />
                <span className="text-xs font-medium">{activityCount}</span>
              </div>

              {dueDate && (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div
                        className={cn(
                          "flex items-center gap-1 text-[10px] font-medium cursor-help",
                          isOverdue
                            ? "text-destructive dark:text-red-400"
                            : "text-muted-foreground",
                        )}
                      >
                        <Calendar className="h-3 w-3" />
                        <span>
                          {formatIST(dueDate)}
                        </span>
                        {isOverdue && <AlertCircle className="h-3 w-3" />}
                      </div>
                    </TooltipTrigger>
                    <TooltipContent side="top">
                      <p className="text-xs font-medium">Due Date</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}

              {subTask.tags && subTask.tags.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-1">
                  {subTask.tags.map((tag) => (
                    <div key={tag.id} className="flex items-center gap-0.5 bg-muted/50 px-1.5 py-0.5 rounded text-[9px] font-medium text-muted-foreground border border-border/50">
                      <Tag className="h-2 w-2" />
                      <span>{tag.name}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {assigneeUser ? (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Avatar className="h-6 w-6 cursor-pointer border-2 border-background">
                      <AvatarFallback className="text-[10px]">
                        {(assigneeUser.surname || (assigneeUser as any).workspaceMember?.user?.surname)?.[0]?.toUpperCase() || "?"}
                      </AvatarFallback>
                    </Avatar>
                  </TooltipTrigger>
                  <TooltipContent side="left">
                    <p>Assignee: {assigneeUser.surname || (assigneeUser as any).workspaceMember?.user?.surname || "Unassigned"}</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            ) : (
              <div onClick={(e) => e.stopPropagation()}>
                <InlineAssigneePicker
                  subTask={subTask as any}
                  members={projectMembers}
                  allowedUserIds={projects?.find(p => p.id === subTask.projectId)?.memberIds}
                  projectId={subTask.projectId}
                  parentTaskId={subTask.parentTaskId!}
                  canEdit={canEdit()}
                  onAssigned={(_userId, member) => {
                    onUpdateInPlace?.(subTask.id, {
                      assignee: {
                        id: member.userId,
                        surname: member.user.surname,
                      },
                    });
                  }}
                  className="whitespace-nowrap"
                />
              </div>
            )}
          </div>
        </CardContent>
        {isUpdating && (
          <div className="absolute inset-0 z-50 flex items-center justify-center bg-background/50 backdrop-blur-[1px] animate-pulse">
            <div className="h-1 w-full bg-primary/30 absolute bottom-0 overflow-hidden">
              <div
                className="h-full w-1/2 bg-primary animate-[shimmer_1.5s_infinite_linear]"
                style={{
                  backgroundImage:
                    "linear-gradient(90deg, transparent, currentColor, transparent)",
                }}
              />
            </div>
          </div>
        )}
      </Card>
      {isMobile && (
        <Drawer open={isStatusDrawerOpen} onOpenChange={setIsStatusDrawerOpen}>
          <DrawerContent className="p-4 pb-10">
            <DrawerHeader className="px-0">
              <DrawerTitle>Change Status</DrawerTitle>
              <DrawerDescription>
                Moving: {subTask.name}
              </DrawerDescription>
            </DrawerHeader>
            <div className="grid grid-cols-2 gap-3 mt-4">
              {COLUMNS.map((col) => {
                const isCurrent = col.id === subTask.status;
                return (
                  <Button
                    key={col.id}
                    variant={isCurrent ? "default" : "outline"}
                    className={cn(
                      "h-14 flex flex-col items-center justify-center gap-1 text-xs font-semibold rounded-xl transition-all",
                      isCurrent && "ring-2 ring-primary/20 scale-105",
                      !isCurrent && "hover:bg-accent border-muted-foreground/10"
                    )}
                    onClick={() => {
                      onStatusChange?.(subTask.id, col.id, subTask.status as TaskStatus);
                      setIsStatusDrawerOpen(false);
                    }}
                  >
                    <div className={cn("h-2 w-2 rounded-full", col.id === "TO_DO" ? "bg-slate-400" : col.id === "IN_PROGRESS" ? "bg-blue-500" : col.id === "REVIEW" ? "bg-purple-500" : col.id === "HOLD" ? "bg-amber-500" : col.id === "COMPLETED" ? "bg-green-500" : "bg-red-500")} />
                    {col.title}
                  </Button>
                );
              })}
            </div>
            <DrawerFooter className="px-0 mt-6">
              <Button variant="ghost" onClick={() => setIsStatusDrawerOpen(false)}>
                Cancel
              </Button>
            </DrawerFooter>
          </DrawerContent>
        </Drawer>
      )}

    </>
  );
});
