import Pusher from "pusher-js";

/**
 * The same public Pusher channels the website and mobile app listen on
 * (team-{workspaceId}, user-{userId}); see apps/mobile/src/lib/realtime.ts.
 * This is what keeps the app in sync: a change made anywhere triggers an event,
 * and the matching cached queries refetch.
 */
const key = (import.meta.env.VITE_PUSHER_KEY ?? "").trim();
const cluster = (import.meta.env.VITE_PUSHER_CLUSTER ?? "ap2").trim();

/** Server events that mean "workspace data changed" (mobile's STANDARD_EVENTS). */
export const DATA_EVENTS = ["team_update", "task_update", "subtask_update", "project_update", "attendance_update", "conversation_update", "meeting_update"];

let pusher: Pusher | null = null;

/** Subscribes to the workspace and user channels; returns the unsubscribe. */
export function startRealtime(workspaceId: string, userId: string, onEvent: (event: string, data: any) => void): () => void {
    if (!key) {
        console.warn("[realtime] VITE_PUSHER_KEY is not set; live updates are off, data refreshes on focus.");
        return () => {};
    }
    pusher ??= new Pusher(key, { cluster });
    const handler = (event: string, data: any) => {
        if (!event.startsWith("pusher:")) onEvent(event, data ?? {});
    };
    const names = [`team-${workspaceId}`, `user-${userId}`];
    names.forEach((name) => pusher!.subscribe(name).bind_global(handler));
    return () =>
        names.forEach((name) => {
            pusher?.channel(name)?.unbind_global(handler);
            pusher?.unsubscribe(name);
        });
}

export function stopRealtime() {
    pusher?.disconnect();
    pusher = null;
}
