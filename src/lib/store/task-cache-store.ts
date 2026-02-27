import { create } from 'zustand';

// Unified Entity Store
interface TaskEntity {
    id: string;
    [key: string]: any;
}

interface ListMetadata {
    ids: string[];
    hasMore: boolean;
    page: number; // legacy
    nextCursor?: any;
    totalCount?: number;
    timestamp: number;
}

interface TaskCacheState {
    entities: Record<string, TaskEntity>;

    // Internal Metadata Maps
    subTaskLists: Record<string, ListMetadata>;
    projectLists: Record<string, ListMetadata>;
    kanbanLists: Record<string, ListMetadata>;

    // Actions
    upsertTasks: (tasks: any[]) => void;

    // Legacy/Public API Adapters
    setCachedSubTasks: (taskId: string, data: { subTasks: any[], hasMore: boolean, page?: number, nextCursor?: any }) => void;
    getCachedSubTasks: (taskId: string) => { subTasks: any[], hasMore: boolean, page: number, nextCursor?: any, timestamp: number } | undefined;

    setProjectTasksCache: (projectId: string, data: { tasks: any[], hasMore: boolean, page?: number, nextCursor?: any, totalCount?: number }) => void;
    getProjectTasksCache: (projectId: string) => { tasks: any[], hasMore: boolean, page: number, nextCursor?: any, totalCount?: number, timestamp: number } | undefined;

    setKanbanTasksCache: (key: string, data: { tasks: any[], hasMore: boolean, page?: number, nextCursor?: any, totalCount?: number }) => void;
    getKanbanTasksCache: (key: string) => { tasks: any[], hasMore: boolean, page: number, nextCursor?: any, totalCount?: number, timestamp: number } | undefined;

    invalidateSubTaskCache: (taskId: string) => void;
    invalidateProjectCache: (projectId: string) => void;
    clearCache: () => void;
}

export const useTaskCacheStore = create<TaskCacheState>((set, get) => ({
    entities: {},
    subTaskLists: {},
    projectLists: {},
    kanbanLists: {},

    upsertTasks: (tasks) => set(state => {
        const newEntities = { ...state.entities };
        for (const t of tasks) {
            const existing = newEntities[t.id];
            // Only spread if existing entity found, otherwise direct assignment
            newEntities[t.id] = existing ? { ...existing, ...t } : t;
        }
        return { entities: newEntities };
    }),

    setCachedSubTasks: (taskId, data) => {
        get().upsertTasks(data.subTasks);
        set(state => ({
            subTaskLists: {
                ...state.subTaskLists,
                [taskId]: {
                    ids: data.subTasks.map(t => t.id),
                    hasMore: data.hasMore,
                    page: data.page || 1,
                    nextCursor: data.nextCursor,
                    timestamp: Date.now()
                }
            }
        }));
    },

    getCachedSubTasks: (taskId) => {
        const list = get().subTaskLists[taskId];
        if (!list) return undefined;
        const entities = get().entities;
        return {
            subTasks: list.ids.map(id => entities[id]).filter(Boolean),
            hasMore: list.hasMore,
            page: list.page,
            nextCursor: list.nextCursor,
            timestamp: list.timestamp
        };
    },

    setProjectTasksCache: (projectId, data) => {
        get().upsertTasks(data.tasks);
        set(state => ({
            projectLists: {
                ...state.projectLists,
                [projectId]: {
                    ids: data.tasks.map(t => t.id),
                    hasMore: data.hasMore,
                    page: data.page || 1,
                    nextCursor: data.nextCursor,
                    totalCount: data.totalCount,
                    timestamp: Date.now()
                }
            }
        }));
    },

    getProjectTasksCache: (projectId) => {
        const list = get().projectLists[projectId];
        if (!list) return undefined;
        const entities = get().entities;
        return {
            tasks: list.ids.map(id => entities[id]).filter(Boolean),
            hasMore: list.hasMore,
            page: list.page,
            nextCursor: list.nextCursor,
            totalCount: list.totalCount,
            timestamp: list.timestamp
        };
    },

    setKanbanTasksCache: (key, data) => {
        get().upsertTasks(data.tasks);
        set(state => ({
            kanbanLists: {
                ...state.kanbanLists,
                [key]: {
                    ids: data.tasks.map(t => t.id),
                    hasMore: data.hasMore,
                    page: data.page || 1,
                    nextCursor: data.nextCursor,
                    totalCount: data.totalCount,
                    timestamp: Date.now()
                }
            }
        }));
    },

    getKanbanTasksCache: (key) => {
        const list = get().kanbanLists[key];
        if (!list) return undefined;
        const entities = get().entities;
        return {
            tasks: list.ids.map(id => entities[id]).filter(Boolean),
            hasMore: list.hasMore,
            page: list.page,
            nextCursor: list.nextCursor,
            totalCount: list.totalCount,
            timestamp: list.timestamp
        };
    },

    invalidateSubTaskCache: (taskId) => set(state => {
        const newLists = { ...state.subTaskLists };
        delete newLists[taskId];
        return { subTaskLists: newLists };
    }),

    invalidateProjectCache: (projectId) => set(state => {
        const newLists = { ...state.projectLists };
        delete newLists[projectId];
        return { projectLists: newLists };
    }),

    clearCache: () => set({
        entities: {},
        subTaskLists: {},
        projectLists: {},
        kanbanLists: {}
    })
}));
