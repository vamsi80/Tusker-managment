import { getEnv } from "./registry";

export const TEAM_UPDATE = "team_update";
export const PROJECT_UPDATE = "project_update";
export const ATTENDANCE_UPDATE = "attendance_update";
export const TASK_UPDATE = "task_update";
export const ACTIVITY_LOG = "activity_log";
export const CONVERSATION_UPDATE = "conversation_update";

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

export type ConversationEventData = {
    workspaceId: string;
    conversationId: string;
    senderId: string;
    content: string;
    timestamp: Date | string;
};

export type PresenceEventData = {
    workspaceId: string;
    userId: string;
    status: "active" | "inactive";
    lastActiveAt: string;
};

export type ActivityLogEventData = {
    workspaceId: string;
    targetUserIds: string[];
    payload: Record<string, unknown>;
};

export async function broadcast(
    workspaceId: string,
    eventName: string,
    data: unknown,
    targetUserIds?: string[]
) {
    const env = getEnv();
    if (!env?.WS_SERVICE) {
        console.warn(`[REALTIME] WS_SERVICE binding not available, skipping ${eventName} broadcast`);
        return;
    }
    try {
        await env.WS_SERVICE.fetch(new Request("https://tusker-ws/broadcast", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "x-broadcast-secret": env.BROADCAST_SECRET ?? "",
            },
            body: JSON.stringify({ workspaceId, event: eventName, data, targetUserIds }),
        }));
    } catch (e) {
        console.error(`[REALTIME] broadcast failed for ${eventName}:`, e);
    }
}

export const broadcastTeamUpdate = (data: TeamEventData) =>
    broadcast(data.workspaceId, TEAM_UPDATE, data, data.targetUserIds);

export const broadcastProjectUpdate = (data: ProjectEventData) =>
    broadcast(data.workspaceId, PROJECT_UPDATE, data, data.targetUserIds);

export const broadcastTaskUpdate = (data: TaskEventData) =>
    broadcast(data.workspaceId, TASK_UPDATE, data, data.targetUserIds);

export const broadcastAttendanceUpdate = (data: AttendanceEventData) =>
    broadcast(data.workspaceId, ATTENDANCE_UPDATE, data, data.targetUserIds);

export const broadcastConversationUpdate = (data: ConversationEventData) =>
    broadcast(data.workspaceId, CONVERSATION_UPDATE, data);

export const broadcastPresenceUpdate = (data: PresenceEventData) =>
    broadcast(data.workspaceId, data.status === "active" ? "user-active" : "user-inactive", {
        userId: data.userId,
        lastActiveAt: data.lastActiveAt,
    });

export const broadcastActivityLog = (data: ActivityLogEventData) =>
    broadcast(data.workspaceId, ACTIVITY_LOG, data.payload, data.targetUserIds);
