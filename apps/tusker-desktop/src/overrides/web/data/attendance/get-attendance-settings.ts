/** Desktop stand-in for apps/web/src/data/attendance/get-attendance-settings.ts: the same settings query, on the API. */
import { api } from "../../lib/desktop-api";

export type { AttendanceLocation, AttendanceSettingsData, PublicHoliday } from "../../../../../../web/src/data/attendance/get-attendance-settings";

export const getAttendanceSettings = (workspaceId: string) => api<any>(`/workspace-admin/${workspaceId}/attendance-settings`);
