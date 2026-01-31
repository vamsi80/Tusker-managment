import { create } from 'zustand';

// Unified Entity Store
interface TaskEntity {
    id: string;
    [key: string]: any;
}

interface ListMetadata {
    ids: string[];
    hasMore: boolean;
    page: number;
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
    setCachedSubTasks: (taskId: string, data: { subTasks: any[], hasMore: boolean, page: number }) => void;
    getCachedSubTasks: (taskId: string) => { subTasks: any[], hasMore: boolean, page: number, timestamp: number } | undefined;

    setProjectTasksCache: (projectId: string, data: { tasks: any[], hasMore: boolean, page: number, totalCount?: number }) => void;
    getProjectTasksCache: (projectId: string) => { tasks: any[], hasMore: boolean, page: number, totalCount?: number, timestamp: number } | undefined;

    setKanbanTasksCache: (key: string, data: { tasks: any[], hasMore: boolean, page: number, totalCount?: number }) => void;
    getKanbanTasksCache: (key: string) => { tasks: any[], hasMore: boolean, page: number, totalCount?: number, timestamp: number } | undefined;

    clearCache: () => void;
}

export const useTaskCacheStore = create<TaskCacheState>((set, get) => ({
    entities: {},
    subTaskLists: {},
    projectLists: {},
    kanbanLists: {},

    upsertTasks: (tasks) => set(state => {
        const newEntities = { ...state.entities };
        tasks.forEach(t => {
            const existing = newEntities[t.id] || {};
            newEntities[t.id] = { ...existing, ...t };
        });
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
                    page: data.page,
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
                    page: data.page,
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
                    page: data.page,
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
            totalCount: list.totalCount,
            timestamp: list.timestamp
        };
    },

    clearCache: () => set({
        entities: {},
        subTaskLists: {},
        projectLists: {},
        kanbanLists: {}
    })
}));
