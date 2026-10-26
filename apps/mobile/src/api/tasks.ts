import { api, request } from "./client";

export type TaskUser = { id: string; surname?: string | null; name?: string | null; image?: string | null } | null;

export type Task = {
    id: string;
    name: string;
    taskSlug: string;
    description?: string | null;
    status?: string | null;
    projectId: string;
    workspaceId?: string;
    parentTaskId?: string | null;
    isParent?: boolean;
    startDate?: string | null;
    dueDate?: string | null;
    days?: number | null;
    position?: number;
    subtaskCount?: number;
    completedSubtaskCount?: number;
    assignee?: TaskUser;
    reviewer?: TaskUser;
    createdBy?: TaskUser;
    tags?: { id: string; name: string; requirePurchase?: boolean }[];
    project?: { id: string; name: string; color?: string; slug?: string; workspaceId?: string };
    parentTask?: { id: string; name: string } | null;
    subTasks?: Task[];
    dependsOnIds?: string[];
    Task_TaskDependency_A?: { id: string }[];
    createdAt?: string;
    updatedAt?: string;
    [key: string]: any;
};

export type TaskListParams = {
    workspaceId: string;
    projectId?: string | string[];
    viewMode?: "list" | "kanban" | "gantt" | "calendar";
    status?: string[];
    assigneeId?: string[];
    tagId?: string[];
    search?: string;
    dueAfter?: string;
    dueBefore?: string;
    limit?: number;
    cursor?: Record<string, any> | null;
    hierarchyMode?: "parents" | "children" | "all";
    onlySubtasks?: boolean;
    includeSubTasks?: boolean;
    sorts?: { field: string; direction: "asc" | "desc" }[];
    /** Plain project MEMBERs see only their own tasks (the dashboard's My Tasks). */
    own?: boolean;
};

export type TaskListResult = {
    tasks: Task[];
    hasMore: boolean;
    nextCursor: Record<string, any> | null;
    totalCount?: number | null;
    facets?: any;
    tasksByStatus?: Record<string, any>;
};

/** Reads the dependency ids however the select shaped them. */
export const dependencyIds = (task: Task): string[] =>
    task.dependsOnIds ?? (task.Task_TaskDependency_A ?? []).map((d) => d.id);

export const tasksApi = {
    /** GET /tasks — the consolidated listing route every web view uses. */
    list: (p: TaskListParams) =>
        api.get<TaskListResult>("/tasks", {
            w: p.workspaceId,
            projectId: p.projectId,
            vm: p.viewMode ?? "list",
            status: p.status,
            assigneeId: p.assigneeId,
            tagId: p.tagId,
            q: p.search,
            da: p.dueAfter,
            db: p.dueBefore,
            l: p.limit ?? 50,
            c: p.cursor ? JSON.stringify(p.cursor) : undefined,
            hm: p.hierarchyMode,
            onlySub: p.onlySubtasks ? "true" : undefined,
            sub: p.includeSubTasks === undefined ? undefined : String(p.includeSubTasks),
            sorts: p.sorts?.length ? JSON.stringify(p.sorts) : undefined,
            own: p.own ? "true" : undefined,
        }),
    count: (p: Omit<TaskListParams, "cursor" | "limit" | "viewMode">) =>
        api.get<{ totalCount: number }>("/tasks/count", {
            w: p.workspaceId,
            projectId: p.projectId,
            status: p.status,
            assigneeId: p.assigneeId,
            tagId: p.tagId,
            q: p.search,
            da: p.dueAfter,
            db: p.dueBefore,
            onlySubtasks: p.onlySubtasks ? "true" : undefined,
        }),
    /** One page per status column. */
    kanban: async (p: { workspaceId: string; projectId?: string[]; assigneeId?: string[]; tagId?: string[]; search?: string; dueAfter?: string; dueBefore?: string; pageSize?: number }) => {
        const body = await request<{ columns: Record<string, { tasks: Task[]; totalCount: number; hasMore: boolean; nextCursor: any }> }>("/tasks/kanban", {
            query: {
                workspaceId: p.workspaceId,
                projectId: p.projectId,
                assigneeId: p.assigneeId,
                tagId: p.tagId,
                search: p.search,
                dueAfter: p.dueAfter,
                dueBefore: p.dueBefore,
                pageSize: p.pageSize ?? 20,
            },
        });
        return (body as any).columns ?? (body as any).data?.columns ?? {};
    },
    subtasks: async (parentId: string, p: { workspaceId: string; projectId?: string; viewMode?: string; pageSize?: number; cursor?: any; status?: string[]; assigneeId?: string[]; tagId?: string[]; search?: string }) => {
        const body = await request<any>(`/tasks/${parentId}/subtasks`, {
            query: {
                w: p.workspaceId,
                p: p.projectId,
                vm: p.viewMode ?? "list",
                ps: p.pageSize ?? 50,
                c: p.cursor ? JSON.stringify(p.cursor) : undefined,
                s: p.status?.length ? JSON.stringify(p.status) : undefined,
                a: p.assigneeId?.length ? JSON.stringify(p.assigneeId) : undefined,
                t: p.tagId?.length ? JSON.stringify(p.tagId) : undefined,
                q: p.search,
            },
        });
        return { subTasks: (body.subTasks ?? []) as Task[], totalCount: body.totalCount ?? 0, hasMore: !!body.hasMore, nextCursor: body.nextCursor ?? null };
    },
    pendingReviews: (workspaceId: string) => api.get<Task[]>("/tasks/pending-reviews", { w: workspaceId }),
    bySlug: (workspaceId: string, slug: string) => api.get<Task>(`/tasks/slug/${slug}`, { w: workspaceId }),
    detail: (taskId: string) =>
        request<any>(`/tasks/${taskId}/detail`, { query: { subtaskLimit: 50, commentLimit: 30, activityLimit: 30 } }),
    comments: (taskId: string, cursor?: string) => request<any>(`/tasks/${taskId}/comments`, { query: { limit: 30, cursor } }),
    activities: (taskId: string, cursor?: string) => request<any>(`/tasks/${taskId}/activities`, { query: { limit: 30, cursor } }),

    create: (input: { name: string; projectId: string; tagIds?: string[]; reviewerId?: string }) => api.post<Task>("/tasks", input),
    createSubtask: (input: {
        name: string;
        projectId: string;
        parentTaskId: string;
        description?: string;
        status?: string;
        assignee?: string;
        reviewerId?: string;
        startDate?: string;
        dueDate?: string;
        days?: number;
        tagIds?: string[];
    }) => api.post<Task>("/tasks/subtask", input),
    bulkUpload: (projectId: string, tasks: any[]) => request("/tasks/bulk", { method: "POST", body: { projectId, tasks } }),

    update: (taskId: string, ctx: { workspaceId: string; projectId: string }, data: Record<string, any>) =>
        api.patch<Task>(`/tasks/${taskId}`, { ...ctx, ...data }),
    patchFields: (taskId: string, ctx: { workspaceId: string; projectId: string }, data: { startDate?: string | null; dueDate?: string | null; assigneeUserId?: string | null; tagIds?: string[] }) =>
        api.patch<Task>(`/tasks/${taskId}/fields`, { ...ctx, ...data }),
    setStatus: (
        taskId: string,
        ctx: { workspaceId: string; projectId: string },
        newStatus: string,
        extra: { comment?: string; attachmentData?: any } = {},
    ) => api.patch<Task>(`/tasks/${taskId}/status`, { ...ctx, newStatus, ...extra }),
    setAssignee: (taskId: string, ctx: { workspaceId: string; projectId: string }, assigneeUserId: string | null, explanation?: string) =>
        request(`/tasks/${taskId}/assignee`, { method: "PATCH", body: { ...ctx, assigneeUserId, explanation } }),
    setDates: (taskId: string, ctx: { workspaceId: string; projectId: string }, startDate: string | null, dueDate: string | null) =>
        api.patch(`/tasks/${taskId}/dates`, { ...ctx, startDate, dueDate }),
    remove: (taskId: string, ctx: { workspaceId: string; projectId: string }) =>
        request(`/tasks/${taskId}`, { method: "DELETE", body: ctx }),
    reorder: (ctx: { workspaceId: string; projectId: string }, subtaskIds: string[]) =>
        request("/tasks/reorder", { method: "PATCH", body: { ...ctx, subtaskIds } }),
    addDependencies: (taskId: string, ctx: { workspaceId: string; projectId: string }, dependsOnIds: string[]) =>
        request(`/tasks/${taskId}/dependencies`, { method: "POST", body: { ...ctx, dependsOnIds } }),
    removeDependency: (taskId: string, ctx: { workspaceId: string; projectId: string }, dependsOnId: string) =>
        request(`/tasks/${taskId}/dependencies/${dependsOnId}`, { method: "DELETE", body: ctx }),

    addComment: (taskId: string, content: string, parentCommentId?: string) =>
        request<any>(`/tasks/${taskId}/comments`, { method: "POST", body: { content, parentCommentId } }),
    markCommentsRead: (taskId: string) => request(`/comments/task/${taskId}/read`, { method: "POST", body: {} }),
    updateComment: (commentId: string, content: string) => api.patch(`/comments/${commentId}`, { content }),
    deleteComment: (commentId: string) => request(`/comments/${commentId}`, { method: "DELETE" }),
    addActivity: (input: { subTaskId: string; text: string; workspaceId: string; projectId: string; attachmentData?: any; previousStatus?: string; targetStatus?: string }) =>
        api.post("/comments/activity", input),
};
