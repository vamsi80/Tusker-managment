import { pusherClient } from "./pusher";

/**
 * Enhanced Real-Time Service (Pusher + PubSub)
 * This utility centralizes all real-time event handling. 
 * It manages the Pusher connection and broadcasts events to local UI components.
 */

type EventCallback = (data: any) => void;

class RealtimeService {
  private events: { [key: string]: EventCallback[] } = {};
  private currentWorkspaceId: string | null = null;
  private currentUserId: string | null = null;

  /**
   * Initialize the service for a specific workspace.
   * This sets up the Pusher subscription.
   * @param userId - Optional User ID for targeted personal notifications
   */
  init(workspaceId: string, userId?: string) {
    if (this.currentWorkspaceId === workspaceId && this.currentUserId === userId) return;

    // Cleanup previous subscription if switching workspaces
    if (this.currentWorkspaceId) {
      this.cleanup();
    }

    this.currentWorkspaceId = workspaceId;
    this.currentUserId = userId || null;
    console.log(`[REALTIME_SERVICE] Initializing for workspace: ${workspaceId}, user: ${userId || "anon"}`);

    if (pusherClient) {
      const channel = pusherClient.subscribe(`team-${workspaceId}`);
      const personalChannel = userId ? pusherClient.subscribe(`user-${userId}`) : null;

      // 1. Bind to core activity log
      channel.bind("activity_log", (data: any) => {
        this.publish(EVENTS.APP_ACTIVITY_LOG, data);
      });

      if (personalChannel) {
        personalChannel.bind("activity_log", (data: any) => {
          this.publish(EVENTS.APP_ACTIVITY_LOG, data);
        });
      }

      // 2. Bind to standard updates (refreshes/surgical sync)
      const standardEvents = ["team_update", "task_update", "subtask_update", "project_update", "attendance_update"];
      standardEvents.forEach(eventName => {
        const handler = (data: any) => {
          console.log(`[REALTIME_SERVICE] 📥 Received ${eventName}:`, data.action || data.type);
          
          // Always publish to the global team_update channel for broad listeners
          this.publish(EVENTS.TEAM_UPDATE, data);

          // Identify category and publish to granular channels
          const action = (data.action || data.type || "").toUpperCase();
          const hasTaskProps = data.projectId || data.parentTaskId || data.taskSlug || data.entityType === "TASK";
          const hasProjectProps = data.entityType === "PROJECT" || (action.includes("PROJECT") && !hasTaskProps);

          if (action.includes("TASK") || eventName.includes("task") || hasTaskProps) {
            this.publish(EVENTS.TASK_UPDATE, data);
          } else if (action.includes("PROJECT") || eventName.includes("project") || hasProjectProps) {
            this.publish(EVENTS.PROJECT_UPDATE, data);
          } else if (action.includes("MEMBER") || action.includes("INVITE")) {
            this.publish(EVENTS.MEMBER_UPDATE, data);
          } else if (action.includes("ATTENDANCE") || action.includes("CHECKED") || action.includes("LEAVE") || eventName.includes("attendance")) {
            this.publish(EVENTS.ATTENDANCE_UPDATE, data);
          }
        };

        channel.bind(eventName, handler);
        if (personalChannel) personalChannel.bind(eventName, handler);
      });
    }
  }

  /**
   * Cleanup Pusher subscriptions
   */
  cleanup() {
    if (pusherClient) {
      if (this.currentWorkspaceId) {
        console.log(`[REALTIME_SERVICE] Cleaning up workspace: ${this.currentWorkspaceId}`);
        pusherClient.unsubscribe(`team-${this.currentWorkspaceId}`);
      }
      if (this.currentUserId) {
        console.log(`[REALTIME_SERVICE] Cleaning up user channel: ${this.currentUserId}`);
        pusherClient.unsubscribe(`user-${this.currentUserId}`);
      }
      this.currentWorkspaceId = null;
      this.currentUserId = null;
    }
  }

  /**
   * Subscribe to a local event
   */
  subscribe(event: string, callback: EventCallback) {
    if (!this.events[event]) {
      this.events[event] = [];
    }
    this.events[event].push(callback);

    return () => {
      this.events[event] = this.events[event].filter(cb => cb !== callback);
    };
  }

  /**
   * Internal: Publish an event to local listeners
   */
  private publish(event: string, data: any) {
    if (!this.events[event]) return;
    this.events[event].forEach(callback => callback(data));
  }
}

// Export a singleton instance
export const pubsub = new RealtimeService();

/**
 * Standard Event Names used across the application
 */
export const EVENTS = {
  APP_ACTIVITY_LOG: "app_activity_log",
  TEAM_UPDATE: "team_update",
  TASK_UPDATE: "task_update",
  PROJECT_UPDATE: "project_update",
  MEMBER_UPDATE: "member_update",
  ATTENDANCE_UPDATE: "attendance_update",
} as const;
