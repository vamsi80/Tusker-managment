"use client";

import React, { useEffect, useRef } from "react";
import { useTaskTableContext } from "../context/task-table-context";
import { SortedTaskList } from "../../sort/sorted-task-list";
import { ProjectTaskGroup } from "../../group/project-task-group";
import { ProjectRow } from "../../project-row";
import { FlatTaskList } from "../../group/flat-task-list";
import { LoadMoreSentinel } from "../../table/load-more-sentinel";
import { TableLoading } from "../../table/table-loading";
import { EmptyState } from "../../table/empty-state";
import { TaskWithSubTasks } from "@/components/task/shared/types";
import { TaskRow } from "../../task-row";
import { SubTaskRow } from "../../subtask-row";
import { useLoadMoreSentinel } from "@/hooks/use-load-more-sentinel";
import { TableCell, TableRow } from "@/components/ui/table";

interface TaskTableBodyProps {
  mode: "sorted" | "hierarchy";
  tasks: TaskWithSubTasks[];
  groupedTasks: Record<string, TaskWithSubTasks[]> | null;
  orderedWorkspaceProjects: any[];
  currentProjectCounts?: Record<string, number>;
  projectTaskCounts: Record<string, number>;
  expandedProjects: Record<string, boolean>;
  toggleProjectExpand: (id: string) => void;
  visibleColumnsCount: number;
  expanded: Record<string, boolean>;
  toggleExpand: (id: string) => void;
  updatingTaskId: string | null;
  setUpdatingTaskId: (id: string | null) => void;
  loadingSubTasks: Record<string, boolean>;
  loadingMoreSubTasks: Record<string, boolean>;
  loadMoreSubTasks: (id: string) => void;
  handleSubTaskClick: (subTask: any) => void;
  handleSubTaskUpdated: (subTaskId: string, updatedData: any) => void;
  handleRequestSubtasks: (taskId: string) => void;
  getCachedSubTasks: (taskId: string) => any;
  projectPagination: Record<string, any>;
  loadProjectTasks: (id: string) => void;
  filtersActive: boolean;
  activeInlineProjectId: string | null;
  setActiveInlineProjectId: (id: string | null) => void;
  ensureFilteredProjectLoad: (id: string) => void;
  isSortedViewLoading: boolean;
  sortedTasks: any[];
  sortedHasMore: boolean;
  isLoadingMoreSorted: boolean;
  loadMoreSorted: () => void;
  isLoadingFilters: boolean;
  setTasks: React.Dispatch<React.SetStateAction<TaskWithSubTasks[]>>;
  isSubtaskFirstMode?: boolean;
  filterPagination: { hasMore: boolean; nextCursor: any; isLoading: boolean };
  loadMoreFiltered: () => void;
}

export function TaskTableBody({
  mode,
  tasks,
  groupedTasks,
  orderedWorkspaceProjects,
  currentProjectCounts,
  projectTaskCounts,
  expandedProjects,
  toggleProjectExpand,
  visibleColumnsCount,
  expanded,
  toggleExpand,
  updatingTaskId,
  setUpdatingTaskId,
  loadingSubTasks,
  loadingMoreSubTasks,
  loadMoreSubTasks,
  handleSubTaskClick,
  handleSubTaskUpdated,
  handleRequestSubtasks,
  getCachedSubTasks,
  projectPagination,
  loadProjectTasks,
  filtersActive,
  activeInlineProjectId,
  setActiveInlineProjectId,
  ensureFilteredProjectLoad,
  isSortedViewLoading,
  sortedTasks,
  sortedHasMore,
  isLoadingMoreSorted,
  loadMoreSorted,
  isLoadingFilters,
  setTasks,
  isSubtaskFirstMode,
  filterPagination,
  loadMoreFiltered,
}: TaskTableBodyProps) {
  const {
    workspaceId,
    projectId,
    members,
    permissions,
    columnVisibility,
    level,
    userId,
    isWorkspaceAdmin,
    leadProjectIds,
    projects,
    projectMap,
    tags,
    canCreateSubTask,
    scrollContainerRef,
  } = useTaskTableContext();

  return (
    <tbody>
      {mode === "sorted" ? (
        <SortedTaskList
          sortedTasks={sortedTasks}
          isLoading={isSortedViewLoading}
          hasMore={sortedHasMore}
          isLoadingMore={isLoadingMoreSorted}
          columnVisibility={columnVisibility}
          visibleColumnsCount={visibleColumnsCount}
          onLoadMore={loadMoreSorted}
          handleSubTaskClick={handleSubTaskClick}
        />
      ) : groupedTasks ? (
        orderedWorkspaceProjects.map((project) => {
          const currentProjectId = project.id;
          const projectTasks = groupedTasks[currentProjectId];

          return (
            <ProjectTaskGroup
              key={currentProjectId}
              projectId={currentProjectId}
              project={project}
              initialTasks={projectTasks}
              totalTasksCount={
                filtersActive
                  ? currentProjectCounts?.[currentProjectId] || projectTaskCounts[currentProjectId] || 0
                  : currentProjectCounts?.[currentProjectId] || projectTaskCounts[currentProjectId] || 0
              }
              isExpanded={expandedProjects[currentProjectId] === true}
              onToggle={() => toggleProjectExpand(currentProjectId)}
              visibleColumnsCount={visibleColumnsCount}
              columnVisibility={columnVisibility}
              expandedTasks={expanded}
              onToggleExpandTask={toggleExpand}
              updatingTaskId={updatingTaskId}
              setUpdatingTaskId={setUpdatingTaskId}
              permissions={permissions}
              userId={userId}
              isWorkspaceAdmin={isWorkspaceAdmin}
              leadProjectIds={leadProjectIds}
              projects={projects}
              projectMap={projectMap}
              onRequestSubtasks={handleRequestSubtasks}
              getCachedSubTasks={getCachedSubTasks}
              tags={tags}
              members={members}
              workspaceId={workspaceId}
              canCreateSubTask={canCreateSubTask}
              loadingSubTasks={loadingSubTasks}
              loadingMoreSubTasks={loadingMoreSubTasks}
              onLoadMoreSubTasks={loadMoreSubTasks}
              handleSubTaskClick={handleSubTaskClick}
              level={level}
              paginationState={projectPagination[currentProjectId]}
              onLoadMore={loadProjectTasks}
              filtersActive={filtersActive}
              activeInlineProjectId={activeInlineProjectId}
              setActiveInlineProjectId={setActiveInlineProjectId}
              onEnsureProjectLoad={ensureFilteredProjectLoad}
              onSubTaskUpdated={handleSubTaskUpdated}
              scrollContainerRef={scrollContainerRef}
              onTasksChange={setTasks}
            />
          );
        })
      ) : isSubtaskFirstMode ? (
        (() => {
          // 1. Double grouping: Project ID -> Parent Task ID
          const projectGroups: Record<string, Record<string, { parentTask: any; subtasks: TaskWithSubTasks[] }>> = {};

          tasks.forEach((t) => {
            const prId = t.projectId || "unknown";
            const paId = t.parentTaskId || "unknown";

            if (!projectGroups[prId]) projectGroups[prId] = {};
            if (!projectGroups[prId][paId]) {
              projectGroups[prId][paId] = {
                // Construct a minimal parent task object from embedded parentTask info
                parentTask: {
                  id: t.parentTaskId || paId,
                  name: (t as any).parentTask?.name || "Unknown Task",
                  taskSlug: (t as any).parentTask?.taskSlug || "",
                  isParent: true,
                  subtaskCount: 0,
                  completedSubtaskCount: 0,
                  projectId: t.projectId,
                  workspaceId: t.workspaceId,
                  createdAt: t.createdAt,
                  subTasks: [],
                },
                subtasks: [],
              };
            }
            projectGroups[prId][paId].subtasks.push(t);
            // Update the subtask count and embed them for TaskRow logic
            projectGroups[prId][paId].parentTask.subtaskCount = projectGroups[prId][paId].subtasks.length;
            projectGroups[prId][paId].parentTask.subTasks = projectGroups[prId][paId].subtasks;
          });

          // 2. Render ProjectRow -> Parent TaskRows -> SubTaskRows
          return Object.entries(projectGroups).map(([prId, parentGroups]) => {
            const project = projectMap[prId] || { id: prId, name: "Unknown Project" };
            const isProjectExpanded = expandedProjects[prId] !== false; // Usually expanded by default in filter view

            return (
              <ProjectRow
                key={prId}
                project={project}
                isExpanded={isProjectExpanded}
                onToggle={() => toggleProjectExpand(prId)}
                colSpan={visibleColumnsCount}
              >
                {Object.entries(parentGroups).map(([paId, group]) => (
                  <React.Fragment key={paId}>
                    {/* Parent Task Row — always shown expanded */}
                    <TaskRow
                      task={group.parentTask as TaskWithSubTasks}
                      isExpanded={expanded[paId] !== false}
                      onToggleExpand={() => toggleExpand(paId)}
                      columnVisibility={columnVisibility}
                      permissions={permissions}
                      userId={userId}
                      isWorkspaceAdmin={isWorkspaceAdmin}
                      leadProjectIds={leadProjectIds}
                      projects={projects}
                      scrollContainerRef={scrollContainerRef}
                    />
                    {/* Matching Subtask Rows rendered as siblings, same as normal expanded view */}
                    {expanded[paId] !== false && group.subtasks.map((subTask) => (
                      <SubTaskRow
                        key={subTask.id}
                        subTask={subTask as any}
                        columnVisibility={columnVisibility}
                        onClick={handleSubTaskClick}
                        members={members as any}
                        projectId={subTask.projectId || projectId}
                        parentTaskId={subTask.parentTaskId || paId}
                        tags={tags}
                        permissions={permissions}
                        userId={userId}
                        isWorkspaceAdmin={isWorkspaceAdmin}
                        leadProjectIds={leadProjectIds}
                        projects={projects}
                        projectMap={projectMap}
                      />
                    ))}
                  </React.Fragment>
                ))}
              </ProjectRow>
            );
          });
        })()
      ) : (
        <FlatTaskList
          initialTasks={tasks}
          columnVisibility={columnVisibility}
          visibleColumnsCount={visibleColumnsCount}
          expandedTasks={expanded}
          onToggleExpandTask={toggleExpand}
          updatingTaskId={updatingTaskId}
          setUpdatingTaskId={setUpdatingTaskId}
          permissions={permissions}
          userId={userId}
          isWorkspaceAdmin={isWorkspaceAdmin}
          leadProjectIds={leadProjectIds}
          projects={projects}
          onRequestSubtasks={handleRequestSubtasks}
          getCachedSubTasks={getCachedSubTasks}
          tags={tags}
          members={members}
          workspaceId={workspaceId}
          projectId={projectId}
          canCreateSubTask={canCreateSubTask}
          loadingSubTasks={loadingSubTasks}
          loadingMoreSubTasks={loadingMoreSubTasks}
          onLoadMoreSubTasks={loadMoreSubTasks}
          handleSubTaskClick={handleSubTaskClick}
          level={level}
          filtersActive={filtersActive}
          activeInlineProjectId={activeInlineProjectId}
          setActiveInlineProjectId={setActiveInlineProjectId}
          scrollContainerRef={scrollContainerRef}
          onTasksChange={setTasks}
        />
      )}
      {!groupedTasks && projectPagination[projectId]?.hasMore && (
        <LoadMoreSentinel
          visibleColumnsCount={visibleColumnsCount}
          projectId={projectId}
          onLoadMore={() => loadProjectTasks(projectId)}
          hasMore={projectPagination[projectId]?.hasMore}
          isLoading={projectPagination[projectId]?.isLoading}
        />
      )}

      {isLoadingFilters && tasks.length === 0 && (
        <TableLoading visibleColumnsCount={visibleColumnsCount} />
      )}

      {mode !== "sorted" && tasks.length === 0 && !isLoadingFilters && !groupedTasks && (
        <EmptyState message="No tasks found" visibleColumnsCount={visibleColumnsCount} />
      )}

      {level === "workspace" && filtersActive && projectPagination["__global_filter__"]?.hasMore && (
        <LoadMoreSentinel
          visibleColumnsCount={visibleColumnsCount}
          projectId="__global_filter__"
          onLoadMore={() => loadProjectTasks("__global_filter__")}
          hasMore={projectPagination["__global_filter__"]?.hasMore}
          isLoading={projectPagination["__global_filter__"]?.isLoading}
        />
      )}

      {isSubtaskFirstMode && filterPagination.hasMore && (
        <FilterLoadMoreSentinel
          visibleColumnsCount={visibleColumnsCount}
          onLoadMore={loadMoreFiltered}
          isLoading={filterPagination.isLoading}
          hasMore={filterPagination.hasMore}
        />
      )}
    </tbody>
  );
}

/**
 * Custom sentinel for filtered results infinite scroll
 */
function FilterLoadMoreSentinel({ visibleColumnsCount, onLoadMore, isLoading, hasMore }: {
  visibleColumnsCount: number;
  onLoadMore: () => void;
  isLoading: boolean;
  hasMore: boolean;
}) {
  const ref = useLoadMoreSentinel<HTMLTableRowElement>({
    onLoadMore,
    isLoading,
    hasMore,
  });

  return (
    <TableRow ref={ref} className="hover:bg-transparent border-0">
      <TableCell colSpan={visibleColumnsCount} className="py-8 text-center">
        {isLoading ? (
          <span className="text-sm text-muted-foreground animate-pulse font-medium">
            Loading more filtered results...
          </span>
        ) : (
          <div className="h-px w-full" />
        )}
      </TableCell>
    </TableRow>
  );
}
