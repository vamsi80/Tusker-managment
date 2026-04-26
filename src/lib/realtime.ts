import { pusherServer } from "./pusher";

/**
 * Team Realtime Events using Pusher.
 * This works perfectly in serverless environments like Vercel.
 */

export const TEAM_UPDATE = "team_update";
export const PROJECT_UPDATE = "project_update";

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

/**
 * Broadcast a team event to all connected clients via Pusher.
 */
export const broadcastTeamUpdate = async (data: TeamEventData) => {
    try {
        if (!pusherServer) {
            console.warn("[REALTIME] Pusher not configured, skipping broadcast.");
            return;
        }
        await pusherServer.trigger(
            `team-${data.workspaceId}`, // Channel name
            TEAM_UPDATE,                // Event name
            data                        // Data payload
        );
    } catch (error) {
        console.error("[REALTIME_PUSHER_ERROR]", error);
    }
};

/**
 * Broadcast a project event to all connected clients via Pusher.
 */
export const broadcastProjectUpdate = async (data: ProjectEventData) => {
    try {
        if (!pusherServer) {
            console.warn("[REALTIME] Pusher not configured, skipping broadcast.");
            return;
        }
        await pusherServer.trigger(
            `team-${data.workspaceId}`, // Using the same team channel for now to keep it simple
            PROJECT_UPDATE,
            data
        );
    } catch (error) {
        console.error("[REALTIME_PROJECT_PUSHER_ERROR]", error);
    }
};
