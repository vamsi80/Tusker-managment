import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

type TaskFilters = {
  status?: string | string[];
  assigneeId?: string | string[];
  tagId?: string | string[];
  search?: string;
  startDate?: string;
  endDate?: string;
  projectId?: string;
  parentTaskId?: string;
  workspaceId?: string;
  [key: string]: any;
};

// ============================================================
// FILTER HASH HELPER - Creates stable cache keys
// ============================================================
function getFilterHash(filters?: TaskFilters): string {
  if (!filters || Object.keys(filters).length === 0) return "__unfiltered__";

  const normalized: Record<string, any> = {};
  Object.keys(filters).forEach((key) => {
    const value = filters[key];
    if (value === undefined || value === null || value === "") {
      normalized[key] = null;
    } else if (Array.isArray(value)) {
      normalized[key] = value.length > 0 ? [...value].sort() : null;
    } else if (typeof value === "string") {
      normalized[key] = value.trim() || null;
    } else {
      normalized[key] = value;
    }
  });

  // Remove null values for cleaner hash
  const cleanKeys = Object.keys(normalized).filter(
    (k) => normalized[k] !== null,
  );
  if (cleanKeys.length === 0) return "__unfiltered__";

  const cleanObj: Record<string, any> = {};
  cleanKeys.forEach((k) => (cleanObj[k] = normalized[k]));

  return JSON.stringify(cleanObj);
}

function getFilterKey(filters?: TaskFilters): string {
  return getFilterHash(filters);
}

// Unified Entity Store
interface TaskEntity {
  id: string;
  updatedAt: string | Date;
  [key: string]: any;
}

interface ListMetadata {
  ids: string[];
  hasMore: boolean;
  page: number;
  nextCursor?: any;
  totalCount?: number;
  timestamp: number;
}

// Filter-aware list storage: { baseKey: { filterHash: ListMetadata } }
type FilterAwareLists = Record<string, Record<string, ListMetadata>>;

interface TaskCacheState {
  userId: string | null;
  entities: Record<string, TaskEntity>;

  // Internal Metadata Maps (filter-aware structure)
  subTaskLists: Record<string, ListMetadata>;
  projectLists: FilterAwareLists;
  kanbanLists: FilterAwareLists;

  // Actions
  upsertTasks: (tasks: any[]) => void;

  // Subtask cache (not filter-aware, subtasks are individual)
  setCachedSubTasks: (
    taskId: string,
    data: {
      subTasks: any[];
      hasMore: boolean;
      page?: number;
      nextCursor?: any;
    },
  ) => void;
  getCachedSubTasks: (taskId: string) =>
    | {
      subTasks: any[];
      hasMore: boolean;
      page: number;
      nextCursor?: any;
      timestamp: number;
    }
    | undefined;

  // Filter-aware project cache methods
  setProjectTasksCache: (
    projectId: string,
    data: {
      tasks: any[];
      hasMore: boolean;
      page?: number;
      nextCursor?: any;
      totalCount?: number;
    },
    filters?: TaskFilters,
  ) => void;
  getProjectTasksCache: (
    projectId: string,
    filters?: TaskFilters,
  ) =>
    | {
      tasks: any[];
      hasMore: boolean;
      page: number;
      nextCursor?: any;
      totalCount?: number;
      timestamp: number;
    }
    | undefined;

  // Filter-aware kanban cache methods
  setKanbanTasksCache: (
    key: string,
    data: {
      tasks: any[];
      hasMore: boolean;
      page?: number;
      nextCursor?: any;
      totalCount?: number;
    },
    filters?: TaskFilters,
  ) => void;
  getKanbanTasksCache: (
    key: string,
    filters?: TaskFilters,
  ) =>
    | {
      tasks: any[];
      hasMore: boolean;
      page: number;
      nextCursor?: any;
      totalCount?: number;
      timestamp: number;
    }
    | undefined;

  // Command API: Invalidate and sync
  invalidateSubTaskCache: (taskId: string) => void;
  invalidateProjectCache: (projectId: string) => void;
  invalidateWorkspaceCache: (workspaceId: string) => void;

  // Surgical Kanban API (for optimistic updates - works with unfiltered state)
  moveTaskBetweenKanbanColumns: (
    subTaskId: string,
    fromStatus: string,
    toStatus: string,
    workspaceId: string,
    projectId?: string,
  ) => void;

  addTaskToKanbanList: (
    task: any,
    workspaceId: string,
    projectId: string,
  ) => void;
  removeTaskFromKanbanList: (
    taskId: string,
    status: string,
    workspaceId: string,
    projectId: string,
  ) => void;

  // Surgical Sync API
  addTaskToProjectList: (
    projectId: string,
    task: any,
    filters?: TaskFilters,
    replaceId?: string,
  ) => void;
  addSubTaskToList: (parentTaskId: string, subTask: any, replaceId?: string) => void;
  removeSubTaskFromList: (parentTaskId: string, subTaskId: string) => void;

  clearCache: () => void;
  ensureUser: (userId: string) => void;
}

export const useTaskCacheStore = create<TaskCacheState>()(
  persist(
    (set, get) => ({
      userId: null,
      entities: {},
      subTaskLists: {},
      projectLists: {},
      kanbanLists: {},

      upsertTasks: (tasks) =>
        set((state) => {
          const newEntities = { ...state.entities };
          for (const t of tasks) {
            const existing = newEntities[t.id];
            if (!existing) {
              newEntities[t.id] = t;
              continue;
            }

            // TEMPORAL GUARD: Determine which version is core-fresher
            const incomingTime = t.updatedAt
              ? new Date(t.updatedAt).getTime()
              : 0;
            const existingTime = existing.updatedAt
              ? new Date(existing.updatedAt).getTime()
              : 0;
            const isIncomingNewer = incomingTime >= existingTime;

            // Start with the older as base, overwrite with newer for core fields
            const older = isIncomingNewer ? existing : t;
            const newer = isIncomingNewer ? t : existing;

            const merged = { ...older, ...newer };

            // RELATION PRESERVATION: Only keep older relations if they are MISSING (undefined) in the newer version.
            // If they are explicitly 'null', it means they were unassigned, so we keep the null.
            if (older.project && newer.project === undefined) merged.project = older.project;
            else if (newer.project && older.project) merged.project = { ...older.project, ...newer.project };

            if (older.assignee && newer.assignee === undefined) merged.assignee = older.assignee;
            if (older.reviewer && newer.reviewer === undefined) merged.reviewer = older.reviewer;
            if (older.tags && newer.tags === undefined) merged.tags = older.tags;
            if (older.tag && newer.tag === undefined) merged.tag = older.tag;
            if (older.createdBy && newer.createdBy === undefined) merged.createdBy = older.createdBy;
            if (older.subTasks && newer.subTasks === undefined) merged.subTasks = older.subTasks;

            newEntities[t.id] = merged;
          }
          return { entities: newEntities };
        }),

      moveTaskBetweenKanbanColumns: (
        subTaskId,
        fromStatus,
        toStatus,
        workspaceId,
        projectId,
      ) => {
        const state = get();
        const contextId = projectId || "";

        // For kanban operations, we work with the unfiltered cache
        const fromKey = `${workspaceId}-${contextId}-${fromStatus}`;
        const toKey = `${workspaceId}-${contextId}-${toStatus}`;

        // Get the unfiltered list for both keys
        const fromList = state.kanbanLists[fromKey]?.["__unfiltered__"];
        const toList = state.kanbanLists[toKey]?.["__unfiltered__"];

        if (!fromList || !fromList.ids.includes(subTaskId)) return;

        const newFromIds = fromList.ids.filter((id) => id !== subTaskId);
        const newToIds = toList
          ? [subTaskId, ...toList.ids.filter((id) => id !== subTaskId)]
          : [subTaskId];

        // Update entities
        const task = state.entities[subTaskId];
        const updatedEntities = task
          ? {
            ...state.entities,
            [subTaskId]: {
              ...task,
              status: toStatus,
              updatedAt: new Date().toISOString(),
            },
          }
          : state.entities;

        // Update Lists - work with unfiltered cache
        set((state) => {
          const kanbanListsCopy = { ...state.kanbanLists };

          if (!kanbanListsCopy[fromKey]) kanbanListsCopy[fromKey] = {};
          if (!kanbanListsCopy[toKey]) kanbanListsCopy[toKey] = {};

          kanbanListsCopy[fromKey] = {
            ...kanbanListsCopy[fromKey],
            ["__unfiltered__"]: {
              ids: newFromIds,
              hasMore: fromList.hasMore,
              page: fromList.page,
              nextCursor: fromList.nextCursor,
              totalCount: Math.max(0, (fromList.totalCount || 0) - 1),
              timestamp: Date.now(),
            },
          };

          if (toList) {
            kanbanListsCopy[toKey] = {
              ...kanbanListsCopy[toKey],
              ["__unfiltered__"]: {
                ids: newToIds,
                hasMore: toList.hasMore,
                page: toList.page,
                nextCursor: toList.nextCursor,
                totalCount: (toList.totalCount || 0) + 1,
                timestamp: Date.now(),
              },
            };
          } else {
            kanbanListsCopy[toKey] = {
              ...kanbanListsCopy[toKey],
              ["__unfiltered__"]: {
                ids: newToIds,
                hasMore: false,
                page: 1,
                totalCount: 1,
                timestamp: Date.now(),
              },
            };
          }

          return { entities: updatedEntities, kanbanLists: kanbanListsCopy };
        });
      },

      addTaskToKanbanList: (task, workspaceId, projectId) => {
        if (!task.status) return;

        const state = get();
        const status = task.status;
        const cacheKey = `${workspaceId}-${projectId}-${status}`;

        get().upsertTasks([task]);

        // Work with unfiltered cache
        const currentList = state.kanbanLists[cacheKey]?.["__unfiltered__"];
        if (!currentList) return;

        const newIds = [
          task.id,
          ...currentList.ids.filter((id) => id !== task.id),
        ];

        set((state) => {
          const kanbanListsCopy = { ...state.kanbanLists };
          if (!kanbanListsCopy[cacheKey]) kanbanListsCopy[cacheKey] = {};

          kanbanListsCopy[cacheKey] = {
            ...kanbanListsCopy[cacheKey],
            ["__unfiltered__"]: {
              ...currentList,
              ids: newIds,
              totalCount: (currentList.totalCount || 0) + 1,
              timestamp: Date.now(),
            },
          };
          return { kanbanLists: kanbanListsCopy };
        });
      },

      removeTaskFromKanbanList: (taskId, status, workspaceId, projectId) => {
        const state = get();
        const cacheKey = `${workspaceId}-${projectId}-${status}`;
        const currentList = state.kanbanLists[cacheKey]?.["__unfiltered__"];

        if (!currentList || !currentList.ids.includes(taskId)) return;

        const newIds = currentList.ids.filter((id) => id !== taskId);

        set((state) => {
          const kanbanListsCopy = { ...state.kanbanLists };
          if (!kanbanListsCopy[cacheKey]) return state;

          kanbanListsCopy[cacheKey] = {
            ...kanbanListsCopy[cacheKey],
            ["__unfiltered__"]: {
              ...currentList,
              ids: newIds,
              totalCount: Math.max(0, (currentList.totalCount || 0) - 1),
              timestamp: Date.now(),
            },
          };
          return { kanbanLists: kanbanListsCopy };
        });
      },

      addTaskToProjectList: (projectId, task, filters, replaceId) => {
        // 1. Always upsert the task entity itself
        get().upsertTasks([task]);

        set((state) => {
          const projectListsCopy = { ...state.projectLists };
          const pKey = projectId;
          const projectEntry = projectListsCopy[pKey] || {};

          // Update ALL filtered versions of this project's list to ensure consistency
          Object.keys(projectEntry).forEach((hash) => {
            const list = projectEntry[hash];
            if (replaceId) {
              // Replace the ID in situ to maintain position during optimistic sync
              list.ids = list.ids.map(id => id === replaceId ? task.id : id);
            } else {
              // Prepend if not already there
              if (!list.ids.includes(task.id)) {
                list.ids = [task.id, ...list.ids];
                list.totalCount = (list.totalCount || 0) + 1;
              }
            }
            list.timestamp = Date.now();
          });

          projectListsCopy[pKey] = projectEntry;
          return { projectLists: projectListsCopy };
        });
      },

      addSubTaskToList: (parentTaskId, subTask, replaceId) => {
        const state = get();
        const currentList = state.subTaskLists[parentTaskId];

        // 1. Always upsert the subtask entity itself
        get().upsertTasks([subTask]);

        // 2. Update parent's subtask count in entities (Only if not replacing)
        const parent = state.entities[parentTaskId];
        if (parent && !replaceId) {
          get().upsertTasks([{
            id: parentTaskId,
            _count: {
              ...(parent as any)._count,
              subTasks: ((parent as any)._count?.subTasks || 0) + 1
            }
          } as any]);
        }

        // 3. Update the list metadata (create if not exists)
        let newIds: string[];
        const timestamp = Date.now();

        if (!currentList) {
          // Initialize a fresh list if it doesn't exist
          newIds = [subTask.id];
          set((state) => ({
            subTaskLists: {
              ...state.subTaskLists,
              [parentTaskId]: {
                ids: newIds,
                hasMore: false,
                page: 1,
                timestamp: timestamp,
                totalCount: 1,
              },
            },
          }));
          return;
        }

        if (replaceId) {
          // Replace the temp ID with the real ID in the exact same position to prevent jumps
          newIds = currentList.ids.map(id => id === replaceId ? subTask.id : id);
        } else {
          newIds = [
            subTask.id,
            ...currentList.ids.filter((id) => id !== subTask.id),
          ];
        }

        set((state) => ({
          subTaskLists: {
            ...state.subTaskLists,
            [parentTaskId]: {
              ...currentList,
              ids: newIds,
              totalCount: replaceId ? currentList.totalCount : (currentList.totalCount || 0) + 1,
              timestamp: timestamp,
            },
          },
        }));
      },

      removeSubTaskFromList: (parentTaskId, subTaskId) => {
        const state = get();
        const currentList = state.subTaskLists[parentTaskId];

        // 1. Update parent's subtask count
        const parent = state.entities[parentTaskId];
        if (parent) {
          get().upsertTasks([{
            id: parentTaskId,
            _count: {
              ...(parent as any)._count,
              subTasks: Math.max(0, ((parent as any)._count?.subTasks || 0) - 1)
            }
          } as any]);
        }

        // 2. Update the list metadata if it exists
        if (!currentList || !currentList.ids.includes(subTaskId)) return;

        const newIds = currentList.ids.filter((id) => id !== subTaskId);

        set((state) => ({
          subTaskLists: {
            ...state.subTaskLists,
            [parentTaskId]: {
              ...currentList,
              ids: newIds,
              totalCount: Math.max(0, (currentList.totalCount || 0) - 1),
              timestamp: Date.now(),
            },
          },
        }));
      },

      setCachedSubTasks: (taskId, data) => {
        get().upsertTasks(data.subTasks);
        set((state) => ({
          subTaskLists: {
            ...state.subTaskLists,
            [taskId]: {
              ids: data.subTasks.map((t) => t.id),
              hasMore: data.hasMore,
              page: data.page || 1,
              nextCursor: data.nextCursor,
              timestamp: Date.now(),
            },
          },
        }));
      },

      getCachedSubTasks: (taskId) => {
        const list = get().subTaskLists[taskId];
        if (!list) return undefined;
        const entities = get().entities;
        return {
          subTasks: list.ids.map((id) => entities[id]).filter(Boolean),
          hasMore: list.hasMore,
          page: list.page,
          nextCursor: list.nextCursor,
          timestamp: list.timestamp,
        };
      },

      setProjectTasksCache: (projectId, data, filters) => {
        get().upsertTasks(data.tasks);
        const filterKey = getFilterKey(filters);
        set((state) => {
          const projectListsCopy = { ...state.projectLists };
          if (!projectListsCopy[projectId]) {
            projectListsCopy[projectId] = {};
          }
          projectListsCopy[projectId] = {
            ...projectListsCopy[projectId],
            [filterKey]: {
              ids: data.tasks.map((t) => t.id),
              hasMore: data.hasMore,
              page: data.page || 1,
              nextCursor: data.nextCursor,
              totalCount: data.totalCount,
              timestamp: Date.now(),
            },
          };
          return { projectLists: projectListsCopy };
        });
      },

      getProjectTasksCache: (projectId, filters) => {
        const filterKey = getFilterKey(filters);
        const state = get();
        const list = state.projectLists[projectId]?.[filterKey];
        if (!list) return undefined;
        const entities = state.entities;
        return {
          tasks: list.ids.map((id) => entities[id]).filter(Boolean),
          hasMore: list.hasMore,
          page: list.page,
          nextCursor: list.nextCursor,
          totalCount: list.totalCount,
          timestamp: list.timestamp,
        };
      },

      setKanbanTasksCache: (key, data, filters) => {
        get().upsertTasks(data.tasks);
        const filterKey = getFilterKey(filters);
        set((state) => {
          const kanbanListsCopy = { ...state.kanbanLists };
          if (!kanbanListsCopy[key]) {
            kanbanListsCopy[key] = {};
          }
          kanbanListsCopy[key] = {
            ...kanbanListsCopy[key],
            [filterKey]: {
              ids: data.tasks.map((t) => t.id),
              hasMore: data.hasMore,
              page: data.page || 1,
              nextCursor: data.nextCursor,
              totalCount: data.totalCount,
              timestamp: Date.now(),
            },
          };
          return { kanbanLists: kanbanListsCopy };
        });
      },

      getKanbanTasksCache: (key, filters) => {
        const filterKey = getFilterKey(filters);
        const state = get();
        const list = state.kanbanLists[key]?.[filterKey];
        if (!list) return undefined;
        const entities = state.entities;
        return {
          tasks: list.ids.map((id) => entities[id]).filter(Boolean),
          hasMore: list.hasMore,
          page: list.page || 1,
          nextCursor: list.nextCursor,
          totalCount: list.totalCount,
          timestamp: list.timestamp,
        };
      },

      invalidateSubTaskCache: (taskId) =>
        set((state) => {
          const newLists = { ...state.subTaskLists };
          delete newLists[taskId];
          return { subTaskLists: newLists };
        }),

      invalidateProjectCache: (projectId) =>
        set((state) => {
          const newLists = { ...state.projectLists };
          delete newLists[projectId];
          // Also clear kanban lists that match this project
          const newKanban = { ...state.kanbanLists };
          Object.keys(newKanban).forEach((key) => {
            if (key.includes(`-${projectId}-`)) {
              delete newKanban[key];
            }
          });
          return { projectLists: newLists, kanbanLists: newKanban };
        }),

      invalidateWorkspaceCache: () =>
        set({
          subTaskLists: {},
          projectLists: {},
          kanbanLists: {},
          entities: {},
        }),

      clearCache: () =>
        set({
          entities: {},
          subTaskLists: {},
          projectLists: {},
          kanbanLists: {},
          userId: null,
        }),

      ensureUser: (userId) => {
        const currentUserId = get().userId;
        if (currentUserId && currentUserId !== userId) {
          set({
            entities: {},
            subTaskLists: {},
            projectLists: {},
            kanbanLists: {},
            userId: userId,
          });
        } else {
          set({ userId });
        }
      },
    }),
    {
      name: "tusker-task-cache",
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        userId: state.userId,
        entities: state.entities,
        kanbanLists: state.kanbanLists,
        projectLists: state.projectLists,
      }),
    },
  ),
);
