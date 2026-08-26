import { pusherServer } from "./pusher";

/**
 * Team Realtime Events using Pusher.
 * This works perfectly in serverless environments like Vercel.
 */

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

/**
 * Core internal broadcast helper.
 * Centralizes all workspace-level events into the same team-{id} channel.
 */
async function broadcast(workspaceId: string, eventName: string, data: any, targetUserIds?: string[]) {
    try {
        if (!pusherServer) {
            console.warn(`[REALTIME] Pusher not configured, skipping ${eventName} broadcast.`);
            return;
        }

        // Target individual users if specified, otherwise broadcast to the whole team
        const channels = targetUserIds && targetUserIds.length > 0
            ? targetUserIds.map(tid => `user-${tid}`)
            : [`team-${workspaceId}`];

        await pusherServer.trigger(channels, eventName, data);
    } catch (error) {
        console.error(`[REALTIME_ERROR] Failed to broadcast ${eventName}:`, error);
    }
}

/**
 * Broadcast a team event (roles, members, invitations).
 */
export const broadcastTeamUpdate = async (data: TeamEventData) => {
    await broadcast(data.workspaceId, TEAM_UPDATE, data, data.targetUserIds);
};

/**
 * Broadcast a project event (creation, updates, deletion).
 */
export const broadcastProjectUpdate = async (data: ProjectEventData) => {
    await broadcast(data.workspaceId, PROJECT_UPDATE, data, data.targetUserIds);
};

/**
 * Broadcast a task event.
 */
export const broadcastTaskUpdate = async (data: TaskEventData) => {
    await broadcast(data.workspaceId, TASK_UPDATE, data, data.targetUserIds);
};

/**
 * Broadcast an attendance event.
 */
export const broadcastAttendanceUpdate = async (data: AttendanceEventData) => {
    await broadcast(data.workspaceId, ATTENDANCE_UPDATE, data, data.targetUserIds);
};
