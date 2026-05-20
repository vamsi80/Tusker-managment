"use client";

import { TaskSummaryWidget } from "./widgets/task-summary-widget";
import { DueThisWeekWidget } from "./widgets/due-this-week-widget";
import { UnassignedMembersWidget } from "./widgets/unassigned-members-widget";

interface DashboardData {
  project: {
    id: string;
    name: string;
    slug: string;
    color: string;
    description: string | null;
    projectManagerId: string | null;
    projectManager?: {
      id: string;
      designation: string | null;
      user: {
        id: string;
        surname: string | null;
      };
    } | null;
  };
  totalCount: number;
  todoCount: number;
  completedCount: number;
  allMembers: any[];
  absentRecords: any[];
  dueThisWeek: any[];
  weekStart: Date | string;
  weekEnd: Date | string;
}

interface ProjectDashboardProps {
  data: DashboardData;
  workspaceId: string;
}

export function ProjectDashboard({ data }: ProjectDashboardProps) {
  const {
    project,
    totalCount,
    todoCount,
    completedCount,
    allMembers,
    absentRecords,
    dueThisWeek,
    weekStart,
    weekEnd,
  } = data;

  // Calculate the count of absent members
  const absentCount = allMembers.filter((member) =>
    absentRecords.some((r) => r.workspaceMemberId === member.workspaceMember?.id)
  ).length;

  return (
    <div className="flex-1 flex flex-col space-y-6 overflow-y-auto">
      {/* Header & Project Manager Card */}
      {/* <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 border-b border-border pb-6">
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-3">
            <div
              className="w-4.5 h-4.5 rounded-full shrink-0 shadow-sm"
              style={{ backgroundColor: project.color || "#3b82f6" }}
            />
            <h1 className="text-2xl font-bold tracking-tight text-foreground">
              {project.name} Dashboard
            </h1>
          </div>
          {project.description && (
            <p className="text-sm text-muted-foreground max-w-2xl leading-relaxed">
              {project.description}
            </p>
          )}
        </div>

        {project.projectManager && (
          <div className="flex items-center gap-3 bg-muted/40 border border-border px-4 py-2.5 rounded-2xl shrink-0 self-start md:self-auto">
            <Avatar className="h-9 w-9">
              <AvatarFallback className="text-muted-foreground font-semibold text-xs">
                {pmDisplayName.substring(0, 1).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div className="flex flex-col">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Project Manager
              </span>
              <span className="text-sm font-semibold text-foreground">
                {pmDisplayName}
              </span>
              {project.projectManager.designation && (
                <span className="text-[10px] text-muted-foreground">
                  {project.projectManager.designation}
                </span>
              )}
            </div>
          </div>
        )}
      </div> */}

      {/* Top Row: Summary Stats */}
      <TaskSummaryWidget
        totalCount={totalCount}
        todoCount={todoCount}
        completedCount={completedCount}
        absentCount={absentCount}
      />

      {/* Grid: Due This Week and Unassigned Members Side-by-Side */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <DueThisWeekWidget
          dueThisWeek={dueThisWeek}
          weekStart={new Date(weekStart)}
          weekEnd={new Date(weekEnd)}
        />
        <UnassignedMembersWidget allMembers={allMembers} />
      </div>
    </div>
  );
}