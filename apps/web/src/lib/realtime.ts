// Event name constants — used by stores and listeners to subscribe via pubsub
export const TEAM_UPDATE = "team_update";
export const PROJECT_UPDATE = "project_update";
export const ATTENDANCE_UPDATE = "attendance_update";
export const TASK_UPDATE = "task_update";

export type TeamEventData = {
    workspaceId: string;
    type: "INVITE" | "DELETE" | "UPDATE";
    payload: Record<string, unknown>;
    targetUserIds?: string[];
};

export type ProjectEventData = {
    workspaceId: string;
    type: "CREATE" | "UPDATE" | "DELETE";
    projectId?: string;
    payload?: Record<string, unknown>;
    targetUserIds?: string[];
};

export type TaskEventData = {
    workspaceId: string;
    type: "CREATE" | "UPDATE" | "DELETE";
    taskId: string;
    projectId: string;
    payload?: Record<string, unknown>;
    targetUserIds?: string[];
};

export type AttendanceEventData = {
    workspaceId: string;
    type: "CHECK_IN" | "CHECK_OUT" | "UPDATE";
    action: "CHECKED_IN" | "CHECKED_OUT" | "ATTENDANCE_UPDATED";
    payload: Record<string, unknown>;
    targetUserIds?: string[];
};
