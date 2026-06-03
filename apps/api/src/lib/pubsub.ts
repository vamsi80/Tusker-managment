// Client-side PubSub (browser only) — not used in the API worker.
// This file exists for import compatibility; actual implementation lives in apps/web.

export const pubsub = {
    init: () => {},
    cleanup: () => {},
    subscribe: (_event: string, _cb: Function) => () => {},
};

export const EVENTS = {
    APP_ACTIVITY_LOG: "app_activity_log",
    TEAM_UPDATE: "team_update",
    TASK_UPDATE: "task_update",
    PROJECT_UPDATE: "project_update",
    MEMBER_UPDATE: "member_update",
    ATTENDANCE_UPDATE: "attendance_update",
    PRESENCE_UPDATE: "presence_update",
    CONVERSATION_UPDATE: "conversation_update",
} as const;
