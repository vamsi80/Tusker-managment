import { TaskStatus as PrismaTaskStatus } from "@tusker/db";

export type TaskStatus = PrismaTaskStatus;

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
    isPinned?: boolean;
    pinnedAt?: Date | null;
    position?: number;
    createdAt: Date;
    updatedAt?: Date;
    createdById: string;
    reviewerId: string | null;
    assigneeId: string | null;

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
        position?: number;
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
    _count?: {
        subTasks?: number;
        activities?: number;
    };
};

export type SubTaskType = WorkspaceTaskType;
export type KanbanSubTaskType = WorkspaceTaskType;

export interface WorkspacePermissions {
    isWorkspaceAdmin: boolean;
    canCreateProject?: boolean;
    isProjectLead?: boolean;
    isProjectManager?: boolean;
    isProjectCoordinator?: boolean;
    hasAccess?: boolean;
    workspaceMemberId: string | null;
    workspaceRole?: string | null;
    userId: string | null;
    userSurname?: string | null;
    reportingManagerName?: string | null;
    leadProjectIds?: string[];
    managedProjectIds?: string[];
    coordinatorProjectIds?: string[];
    memberProjectIds?: string[];
    viewerProjectIds?: string[];
    isMember?: boolean;
    canCreateSubTask?: boolean;
    canPerformBulkOperations?: boolean;
    projectMember?: {
        id: string;
        projectRole: string;
    } | null;
}

export interface CreateTaskParams {
    name: string;
    projectId: string;
    workspaceId: string;
    userId: string;
    permissions: WorkspacePermissions;
    tagIds?: string[];
}

export interface CreateSubTaskParams {
    name: string;
    description?: string;
    projectId: string;
    workspaceId: string;
    parentTaskId: string;
    userId: string;
    permissions: WorkspacePermissions;
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
    permissions: WorkspacePermissions;
    data: Partial<CreateSubTaskParams>;
}

export interface DeleteTaskParams {
    taskId: string;
    workspaceId: string;
    projectId: string;
    userId: string;
    permissions: WorkspacePermissions;
}

export interface UpdateTaskDatesParams {
    taskId: string;
    startDate: string | Date;
    dueDate: string | Date;
    workspaceId: string;
    projectId: string;
    userId: string;
    permissions: WorkspacePermissions;
}

export interface AddDependencyParams {
    subtaskId: string;
    dependsOnIds: string[];
    projectId: string;
    workspaceId: string;
    permissions: WorkspacePermissions;
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
    nextCursor: string | null | undefined;
    currentPage: number;
}
