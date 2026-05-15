"use client";

import { memo, useState, useMemo, useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import { Loader2 } from "lucide-react";
import { useWorkspaceLayout } from "@/app/w/[workspaceId]/_components/workspace-layout-context";
import { GlobalFilterToolbar } from "../shared/global-filter-toolbar";
import { TaskTableProvider } from "./task-table/context/task-table-context";
import { useTaskTableLogic } from "./task-table/hooks/use-task-table-logic";
import { TaskTableHeader } from "./task-table/components/task-header";
import { TaskTableBody } from "./task-table/components/task-table-body";
import type { TaskWithSubTasks } from "@/components/task/shared/types";
import type { ProjectMembersType } from "@/types/project";
import type { UserPermissionsType } from "@/data/user/get-user-permissions";

interface TaskTableProps {
  initialTasks: TaskWithSubTasks[];
  initialHasMore: boolean;
  initialNextCursor?: any;
  initialTotalCount?: number;
  members: ProjectMembersType;
  assignees?: Array<{ id: string; name: string; surname?: string }>;
  workspaceId: string;
  projectId: string;
  canCreateSubTask: boolean;
  isWorkspaceAdmin?: boolean;
  level?: "workspace" | "project";
  permissions?: UserPermissionsType;
  userId?: string;
  projectCounts?: Record<string, number>;
  isShell?: boolean;
}

function TaskTable(props: TaskTableProps) {
  useEffect(() => {
    console.log("DEBUG [TaskTable] Mounted");
    return () => console.log("DEBUG [TaskTable] Unmounted");
  }, []);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const { data: layoutData } = useWorkspaceLayout();
  const projects = useMemo(() => layoutData.projects || [], [layoutData.projects]);
  const leadProjectIds = layoutData.permissions?.leadProjectIds || [];

  const [columnVisibility, setColumnVisibility] = useState({
    assignee: true,
    reviewer: true,
    startDate: true,
    dueDate: true,
    progress: true,
    status: true,
    tag: true,
    description: true,
    project: props.level === "workspace",
  });

  const projectMap = useMemo(() => {
    const map: Record<string, any> = {};
    projects?.forEach((p) => { map[p.id] = p; });
    return map;
  }, [projects]);

  const filterMembers = useMemo(() => {
    if (props.assignees) return props.assignees;
    return props.members?.map(m => ({
      id: m.userId,
      surname: m.user.surname || m.user.name || "Unknown"
    })) || [];
  }, [props.assignees, props.members]);

  const logic = useTaskTableLogic({
    ...props,
    projects,
  });

  const contextValue = {
    workspaceId: props.workspaceId,
    projectId: props.projectId,
    members: props.members,
    permissions: props.permissions,
    columnVisibility,
    setColumnVisibility,
    level: props.level || "project",
    isWorkspaceAdmin: props.isWorkspaceAdmin || false,
    userId: props.userId,
    canCreateSubTask: props.canCreateSubTask,
    tags: logic.tags,
    projects,
    projectMap,
    leadProjectIds,
    scrollContainerRef,
  };

  const mode = logic.sorts.length > 0 ? "sorted" : "hierarchy";
  const visiblePropsCount = Object.entries(columnVisibility)
    .filter(([key, visible]) => key !== 'project' && visible)
    .length;
  const visibleColumnsCount = 2 + visiblePropsCount + 1; // Chevron + Name + Props + Actions

  // Grouping logic for workspace view — skip if in subtask-first mode (filters active),
  // because subtasks need to be rendered flat with parent-label headers, not in ProjectTaskGroup
  const groupedTasks = useMemo(() => {
    if (props.level !== "workspace") return null;
    if (logic.isSubtaskFirstMode) return null; // Let isSubtaskFirstMode branch handle rendering
    const groups: Record<string, TaskWithSubTasks[]> = {};
    logic.tasks.forEach((task) => {
      const pId = task.projectId || "unknown";
      if (!groups[pId]) groups[pId] = [];
      groups[pId].push(task);
    });
    return groups;
  }, [logic.tasks, props.level, logic.isSubtaskFirstMode]);

  const orderedWorkspaceProjects = useMemo(() => {
    if (props.level !== "workspace") return projects;
    return [...projects].filter(p => !!groupedTasks?.[p.id] || (logic.currentProjectCounts?.[p.id] ?? 0) > 0)
      .sort((a, b) => String(b.id).localeCompare(String(a.id), undefined, { numeric: true }));
  }, [props.level, projects, groupedTasks, logic.currentProjectCounts]);

  const projectTaskCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    logic.tasks.forEach((t) => { counts[t.projectId || "unknown"] = (counts[t.projectId || "unknown"] || 0) + 1; });
    return counts;
  }, [logic.tasks]);

  return (
    <TaskTableProvider value={{ ...contextValue, scrollContainerRef }}>
      <div className="space-y-4 mt-0">
        <GlobalFilterToolbar
          className="flex-1"
          level={props.level === "workspace" ? "workspace" : "project"}
          view="list"
          filters={logic.filters}
          searchQuery={logic.searchQuery}
          projects={projects}
          members={filterMembers}
          tags={logic.tags}
          onFilterChange={logic.setFilters}
          onSearchChange={logic.setSearchQuery}
          onClearAll={logic.clearFilters}
          columnVisibility={columnVisibility}
          setColumnVisibility={setColumnVisibility}
        />

        <div className="rounded-md border overflow-hidden relative">
          {logic.isLoadingFilters && (
            <div className="absolute inset-0 z-50 flex items-center justify-center bg-background/50 backdrop-blur-sm">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          )}
          <div ref={scrollContainerRef} className={cn("overflow-auto", props.level === "workspace" ? "max-h-[70vh]" : "max-h-[65vh]", "mt-0")}>
            <table className="w-full caption-bottom text-sm table-fixed">
              <TaskTableHeader
                sorts={logic.sorts}
                onSortChange={logic.handleSort}
                onExpandAll={logic.handleExpandAll}
                onCollapseAll={logic.handleCollapseAll}
              />
              <TaskTableBody
                mode={mode as any}
                tasks={logic.tasks}
                groupedTasks={groupedTasks}
                orderedWorkspaceProjects={orderedWorkspaceProjects}
                projectTaskCounts={projectTaskCounts}
                expandedProjects={logic.expandedProjects}
                toggleProjectExpand={logic.toggleProjectExpand}
                visibleColumnsCount={visibleColumnsCount}
                expanded={logic.expanded}
                toggleExpand={logic.toggleExpand}
                updatingTaskId={logic.updatingTaskId}
                setUpdatingTaskId={logic.setUpdatingTaskId}
                loadingSubTasks={logic.loadingSubTasks}
                loadingMoreSubTasks={logic.loadingMoreSubTasks}
                loadMoreSubTasks={logic.loadMoreSubTasks}
                handleSubTaskClick={logic.handleSubTaskClick}
                handleSubTaskUpdated={logic.handleSubTaskUpdated}
                handleRequestSubtasks={logic.handleRequestSubtasks}
                getCachedSubTasks={() => ({})}
                projectPagination={logic.projectPagination}
                loadProjectTasks={logic.loadProjectTasks}
                filtersActive={logic.filtersActive}
                activeInlineProjectId={logic.activeInlineProjectId}
                setActiveInlineProjectId={logic.setActiveInlineProjectId}
                ensureFilteredProjectLoad={() => { }}
                isSortedViewLoading={logic.isSortedViewLoading}
                sortedTasks={logic.sortedTasks}
                sortedHasMore={logic.sortedHasMore}
                isLoadingMoreSorted={logic.isLoadingMoreSorted}
                loadMoreSorted={logic.loadMoreSorted}
                isLoadingFilters={logic.isLoadingFilters}
                setTasks={logic.setTasks}
                isSubtaskFirstMode={logic.isSubtaskFirstMode}
                filterPagination={logic.filterPagination}
                loadMoreFiltered={logic.loadMoreFiltered}
              />
            </table>
          </div>
        </div>
      </div>
    </TaskTableProvider>
  );
}

export default memo(TaskTable);
