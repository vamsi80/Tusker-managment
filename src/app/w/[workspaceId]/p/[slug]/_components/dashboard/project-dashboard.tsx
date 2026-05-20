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
  presentRecords: any[];
  dueThisWeek: any[];
  weekStart: Date | string;
  weekEnd: Date | string;
  hasFullAccess: boolean;
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
    presentRecords,
    dueThisWeek,
    weekStart,
    weekEnd,
    hasFullAccess,
  } = data;

  // Absent count: only meaningful for PM/Lead who can see all members
  const absentCount = hasFullAccess
    ? allMembers.filter((member) =>
      member.workspaceMember?.workspaceRole !== "OWNER" &&
      member.workspaceMember?.workspaceRole !== "ADMIN" &&
      !presentRecords.some((r) => r.workspaceMemberId === member.workspaceMember?.id)
    ).length
    : 0;

  return (
    <div className="flex-1 flex flex-col space-y-6 overflow-y-auto">
      <TaskSummaryWidget
        totalCount={totalCount}
        todoCount={todoCount}
        completedCount={completedCount}
        absentCount={absentCount}
        showAbsent={hasFullAccess}
      />

      <div className={`grid grid-cols-1 ${hasFullAccess ? "md:grid-cols-2" : ""} gap-6`}>
        <DueThisWeekWidget
          dueThisWeek={dueThisWeek}
          weekStart={new Date(weekStart)}
          weekEnd={new Date(weekEnd)}
        />
        {hasFullAccess && <UnassignedMembersWidget allMembers={allMembers} />}
      </div>
    </div>
  );
}