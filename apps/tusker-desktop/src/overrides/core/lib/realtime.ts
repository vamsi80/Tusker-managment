/**
 * Desktop stand-in for packages/core/src/lib/realtime.ts. Browser code only
 * imports the event names; broadcasting happens on the server (the API does it
 * after each change), so the broadcast helpers are no-ops here.
 */
export const TEAM_UPDATE = "team_update";
export const PROJECT_UPDATE = "project_update";
export const ATTENDANCE_UPDATE = "attendance_update";
export const TASK_UPDATE = "task_update";
export const MEETING_UPDATE = "meeting_update";

export type MeetingEventData = Record<string, unknown>;
export type TeamEventData = Record<string, unknown>;
export type ProjectEventData = Record<string, unknown>;
export type TaskEventData = Record<string, unknown>;
export type AttendanceEventData = Record<string, unknown>;

const noop = async (_data: unknown) => {};
export const broadcastTeamUpdate = noop;
export const broadcastProjectUpdate = noop;
export const broadcastTaskUpdate = noop;
export const broadcastAttendanceUpdate = noop;
export const broadcastMeetingUpdate = noop;
