import { TaskStatus as PrismaTaskStatus } from "@/generated/prisma";

/**
 * TaskStatus — Unified status type
 */
export type TaskStatus = PrismaTaskStatus;

/**
 * WorkspaceTaskType — The shared task shape returned by the data access layer.
 */
export type WorkspaceTaskType = {
    id: string;
    name: string;
    status: TaskStatus | null;
    taskSlug: string;
    description: string | null;
    startDate: Date | null;
    dueDate: Date | null;
    days: number | null;
    projectId: string;
    workspaceId?: string;
    parentTaskId?: string | null;
    isParent?: boolean;
    // Removed from schema — kept for backwards compat
    isPinned?: boolean;
    pinnedAt?: Date | null;
    position?: number;
    createdAt: Date;
    updatedAt?: Date;
    createdById: string;
    reviewerId: string | null;
    assigneeId: string | null;


    // Flat metadata - optimized for performance
    assignee?: {
        id: string;
        surname: string | null;
    } | null;
    reviewer?: {
        id: string;
        surname: string | null;
    } | null;
    createdBy?: {
        id: string;
        surname: string | null;
    } | null;
    parentTask?: {
        id: string;
        name: string;
        taskSlug: string;
        reviewerId?: string | null;
        reviewer?: {
            id: string;
            surname: string | null;
        } | null;
    } | null;
    project?: {
        id: string;
        name: string;
        slug: string;
        color: string;
        workspaceId: string;
        projectMembers?: {
            workspaceMember: {
                user: {
                    surname: string | null;
                };
            };
        }[];
    } | null;
    tags?: {
        id: string;
        name: string;
    }[];
    subtaskCount: number;
    completedSubtaskCount: number;
    _count: {
        subTasks?: number;
        activities: number;
    };
};

/**
 * Common Task Aliases
 */
export type SubTaskType = WorkspaceTaskType;
export type KanbanSubTaskType = WorkspaceTaskType;

/**
 * Params for Task Operations
 */
export interface CreateTaskParams {
    name: string;
    projectId: string;
    workspaceId: string;
    userId: string;
    permissions: any;
    tagIds?: string[];
}

export interface CreateSubTaskParams {
    name: string;
    description?: string;
    projectId: string;
    workspaceId: string;
    parentTaskId: string;
    userId: string;
    permissions: any;
    assigneeUserId?: string | null;
    reviewerUserId?: string | null;
    tagIds?: string[];
    startDate?: string | null;
    dueDate?: string | null;
    days?: number;
    status?: TaskStatus;
}

export interface UpdateTaskParams {
    taskId: string;
    workspaceId: string;
    projectId: string;
    userId: string;
    permissions: any;
    data: Partial<CreateSubTaskParams>;
}

export interface DeleteTaskParams {
    taskId: string;
    workspaceId: string;
    projectId: string;
    userId: string;
    permissions: any;
}

export interface UpdateTaskDatesParams {
    taskId: string;
    startDate: string | Date;
    dueDate: string | Date;
    workspaceId: string;
    projectId: string;
    userId: string;
    permissions: any;
}

export interface AddDependencyParams {
    subtaskId: string;
    dependsOnIds: string[];
    projectId: string;
    workspaceId: string;
    permissions: any;
}

export interface UpdateTaskAssigneeParams {
    taskId: string;
    assigneeUserId: string | null;
    explanation?: string;
    workspaceId: string;
    projectId: string;
    userId: string;
    userName: string;
}

export interface SubTasksByStatusResponse {
    subTasks: KanbanSubTaskType[];
    totalCount: number;
    hasMore: boolean;
    nextCursor: any;
    currentPage: number;
}
