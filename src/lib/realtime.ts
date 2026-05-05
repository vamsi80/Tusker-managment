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
};

export type ProjectEventData = {
    workspaceId: string;
    type: "CREATE" | "UPDATE" | "DELETE";
    projectId?: string;
    payload?: any;
};

export type TaskEventData = {
    workspaceId: string;
    type: "CREATE" | "UPDATE" | "DELETE";
    taskId: string;
    projectId: string;
    payload?: any;
};

export type AttendanceEventData = {
    workspaceId: string;
    type: "CHECK_IN" | "CHECK_OUT" | "UPDATE";
    action: "CHECKED_IN" | "CHECKED_OUT" | "ATTENDANCE_UPDATED";
    payload: any;
};

/**
 * Core internal broadcast helper.
 * Centralizes all workspace-level events into the same team-{id} channel.
 */
async function broadcast(workspaceId: string, eventName: string, data: any) {
    try {
        if (!pusherServer) {
            console.warn(`[REALTIME] Pusher not configured, skipping ${eventName} broadcast.`);
            return;
        }
        await pusherServer.trigger(`team-${workspaceId}`, eventName, data);
    } catch (error) {
        console.error(`[REALTIME_ERROR] Failed to broadcast ${eventName}:`, error);
    }
}

/**
 * Broadcast a team event (roles, members, invitations).
 */
export const broadcastTeamUpdate = async (data: TeamEventData) => {
    await broadcast(data.workspaceId, TEAM_UPDATE, data);
};

/**
 * Broadcast a project event (creation, updates, deletion).
 */
export const broadcastProjectUpdate = async (data: ProjectEventData) => {
    await broadcast(data.workspaceId, PROJECT_UPDATE, data);
};

/**
 * Broadcast a task event.
 */
export const broadcastTaskUpdate = async (data: TaskEventData) => {
    await broadcast(data.workspaceId, TASK_UPDATE, data);
};

/**
 * Broadcast an attendance event.
 */
export const broadcastAttendanceUpdate = async (data: AttendanceEventData) => {
    await broadcast(data.workspaceId, ATTENDANCE_UPDATE, data);
};
