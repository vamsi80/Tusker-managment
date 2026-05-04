"use client";

import React from "react";
import { useTaskTableContext } from "../context/task-table-context";
import { SortedTaskList } from "../../sort/sorted-task-list";
import { ProjectTaskGroup } from "../../group/project-task-group";
import { FlatTaskList } from "../../group/flat-task-list";
import { LoadMoreSentinel } from "../../table/load-more-sentinel";
import { TableLoading } from "../../table/table-loading";
import { EmptyState } from "../../table/empty-state";
import { TaskWithSubTasks } from "@/components/task/shared/types";

interface TaskTableBodyProps {
  mode: "sorted" | "hierarchy";
  tasks: TaskWithSubTasks[];
  setTasks: React.Dispatch<React.SetStateAction<TaskWithSubTasks[]>>;
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
  handleOptimisticSubTaskUpdated: (subTaskId: string, updatedData: any) => void;
  handleRequestSubtasks: (taskId: string) => void;
  getCachedSubTasks: (taskId: string) => any;
  projectPagination: Record<string, any>;
  getObserver: () => IntersectionObserver;
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
}

export function TaskTableBody({
  mode,
  tasks,
  setTasks,
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
  handleOptimisticSubTaskUpdated,
  handleRequestSubtasks,
  getCachedSubTasks,
  projectPagination,
  getObserver,
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
              getObserver={getObserver}
              filtersActive={filtersActive}
              activeInlineProjectId={activeInlineProjectId}
              setActiveInlineProjectId={setActiveInlineProjectId}
              onEnsureProjectLoad={ensureFilteredProjectLoad}
              onSubTaskUpdated={handleOptimisticSubTaskUpdated}
              scrollContainerRef={scrollContainerRef}
              onUpdateParentTaskLists={(updatedProjectTasks) => {
                setTasks((prev) => {
                  const taskMap = new Map(prev.map((t) => [t.id, t]));
                  updatedProjectTasks.forEach((t) => taskMap.set(t.id, t));
                  return Array.from(taskMap.values());
                });
              }}
            />
          );
        })
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
          onUpdateParentTaskLists={(updatedTasks) => {
            setTasks(updatedTasks);
          }}
        />
      )}
      {!groupedTasks && projectPagination[projectId]?.hasMore && (
        <LoadMoreSentinel
          visibleColumnsCount={visibleColumnsCount}
          projectId={projectId}
          observer={getObserver()}
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
          observer={getObserver()}
        />
      )}
    </tbody>
  );
}
