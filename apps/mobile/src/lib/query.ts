import { AppState, Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { QueryClient, focusManager, onlineManager } from "@tanstack/react-query";
import { createAsyncStoragePersister } from "@tanstack/query-async-storage-persister";
import { ApiError } from "../api/client";

/**
 * Cached data is shown instantly (also across launches, via the persister) and
 * refreshed in the background — the app never blocks on a spinner for data it
 * has seen before.
 */
export const queryClient = new QueryClient({
    defaultOptions: {
        queries: {
            staleTime: 30_000,
            gcTime: 24 * 60 * 60 * 1000,
            retry: (count, error) => !(error instanceof ApiError && error.status >= 400 && error.status < 500) && count < 2,
            refetchOnReconnect: true,
        },
        mutations: { retry: 0 },
    },
});

export const queryPersister = createAsyncStoragePersister({
    storage: AsyncStorage,
    key: "tusker.query-cache",
    throttleTime: 2000,
});

// Refetch stale queries when the app returns to the foreground.
AppState.addEventListener("change", (status) => {
    if (Platform.OS !== "web") focusManager.setFocused(status === "active");
});

// The API answering at all is the online signal; a failed fetch flips it off
// until the next successful one, pausing retries rather than hammering.
onlineManager.setOnline(true);

/** Query keys, grouped so a mutation can invalidate a whole area. */
export const qk = {
    layout: (w: string) => ["layout", w] as const,
    workspaces: () => ["workspaces"] as const,
    members: (w: string, extra?: unknown) => ["members", w, extra ?? null] as const,
    membersSlim: (w: string) => ["members-slim", w] as const,
    birthdays: (w: string) => ["birthdays", w] as const,
    broadcasts: (w: string) => ["broadcasts", w] as const,
    departments: (w: string) => ["departments", w] as const,
    projects: (w: string) => ["projects", w] as const,
    project: (id: string) => ["project", id] as const,
    projectDashboard: (w: string, id: string) => ["project-dashboard", w, id] as const,
    projectPermissions: (w: string, id: string) => ["project-permissions", w, id] as const,
    projectMembers: (id: string) => ["project-members", id] as const,
    projectSettings: (w: string, id: string) => ["project-settings", w, id] as const,
    projectMaterials: (w: string, id: string) => ["project-materials", w, id] as const,
    tasks: (w: string, params?: unknown) => ["tasks", w, params ?? null] as const,
    kanban: (w: string, params?: unknown) => ["tasks", w, "kanban", params ?? null] as const,
    subtasks: (parentId: string, params?: unknown) => ["tasks", "subtasks", parentId, params ?? null] as const,
    task: (id: string) => ["task", id] as const,
    reviews: (w: string) => ["reviews", w] as const,
    tags: (w: string) => ["tags", w] as const,
    calendar: (w: string, range?: unknown) => ["calendar", w, range ?? null] as const,
    attendanceToday: (w: string) => ["attendance-today", w] as const,
    attendance: (w: string, f?: unknown) => ["attendance", w, f ?? null] as const,
    register: (w: string, d?: string) => ["register", w, d ?? null] as const,
    leaves: (w: string, f?: unknown) => ["leaves", w, f ?? null] as const,
    leaveBalance: (w: string) => ["leave-balance", w] as const,
    reports: (w: string, f?: unknown) => ["reports", w, f ?? null] as const,
    reportForm: (w: string) => ["report-form", w] as const,
    notifications: (w: string) => ["notifications", w] as const,
    conversations: (w: string) => ["conversations", w] as const,
    chatMembers: (w: string) => ["chat-members", w] as const,
    messages: (w: string, id: string) => ["messages", w, id] as const,
    todos: (w: string) => ["todos", w] as const,
    board: (w: string) => ["board", w] as const,
    indents: (w: string) => ["indents", w] as const,
    indent: (w: string, id: string) => ["indent", w, id] as const,
    lineItems: (w: string, f?: unknown) => ["line-items", w, f ?? null] as const,
    units: (w: string) => ["units", w] as const,
    quotes: (w: string, lineItemId: string) => ["quotes", w, lineItemId] as const,
    pos: (w: string) => ["pos", w] as const,
    po: (w: string, id: string) => ["po", w, id] as const,
    vendors: (w: string, f?: unknown) => ["vendors", w, f ?? null] as const,
    vendor: (w: string, id: string) => ["vendor", w, id] as const,
    vendorMaterials: (w: string, id: string) => ["vendor-materials", w, id] as const,
    coverage: (w: string) => ["coverage", w] as const,
    catalog: (w: string) => ["catalog", w] as const,
    points: (w: string) => ["points", w] as const,
    activity: (w: string, projectId?: string) => ["activity", w, projectId ?? null] as const,
    audit: (w: string) => ["audit", w] as const,
    permissionsGrid: (w: string) => ["permissions-grid", w] as const,
    shiftSchedules: (w: string) => ["shift-schedules", w] as const,
    attendanceSettings: (w: string) => ["attendance-settings", w] as const,
    profile: () => ["profile"] as const,
    travisThreads: (w: string) => ["travis-threads", w] as const,
};
