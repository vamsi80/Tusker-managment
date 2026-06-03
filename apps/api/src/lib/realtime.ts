import type { PusherClient } from "./pusher";

export const TEAM_UPDATE = "team_update";
export const PROJECT_UPDATE = "project_update";
export const ATTENDANCE_UPDATE = "attendance_update";
export const TASK_UPDATE = "task_update";

export type TeamEventData = {
    workspaceId: string;
    type: "INVITE" | "DELETE" | "UPDATE";
    payload: any;
    targetUserIds?: string[];
};

export type ProjectEventData = {
    workspaceId: string;
    type: "CREATE" | "UPDATE" | "DELETE";
    projectId?: string;
    payload?: any;
    targetUserIds?: string[];
};

export type TaskEventData = {
    workspaceId: string;
    type: "CREATE" | "UPDATE" | "DELETE";
    taskId: string;
    projectId: string;
    payload?: any;
    targetUserIds?: string[];
};

export type AttendanceEventData = {
    workspaceId: string;
    type: "CHECK_IN" | "CHECK_OUT" | "UPDATE";
    action: "CHECKED_IN" | "CHECKED_OUT" | "ATTENDANCE_UPDATED";
    payload: any;
    targetUserIds?: string[];
};

async function broadcast(
    pusher: PusherClient | null,
    workspaceId: string,
    eventName: string,
    data: any,
    targetUserIds?: string[]
) {
    if (!pusher) {
        console.warn(`[REALTIME] Pusher not configured, skipping ${eventName} broadcast.`);
        return;
    }
    try {
        const channels = targetUserIds && targetUserIds.length > 0
            ? targetUserIds.map(tid => `user-${tid}`)
            : [`team-${workspaceId}`];
        await pusher.trigger(channels, eventName, data);
    } catch (error) {
        console.error(`[REALTIME_ERROR] Failed to broadcast ${eventName}:`, error);
    }
}

export const broadcastTeamUpdate = async (pusher: PusherClient | null, data: TeamEventData) =>
    broadcast(pusher, data.workspaceId, TEAM_UPDATE, data, data.targetUserIds);

export const broadcastProjectUpdate = async (pusher: PusherClient | null, data: ProjectEventData) =>
    broadcast(pusher, data.workspaceId, PROJECT_UPDATE, data, data.targetUserIds);

export const broadcastTaskUpdate = async (pusher: PusherClient | null, data: TaskEventData) =>
    broadcast(pusher, data.workspaceId, TASK_UPDATE, data, data.targetUserIds);

export const broadcastAttendanceUpdate = async (pusher: PusherClient | null, data: AttendanceEventData) =>
    broadcast(pusher, data.workspaceId, ATTENDANCE_UPDATE, data, data.targetUserIds);
