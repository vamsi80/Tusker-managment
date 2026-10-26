import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { workspacesApi, type WorkspaceLayout, type WorkspaceSummary } from "../api/workspaces";
import { presenceApi } from "../api/comms";
import { qk } from "../lib/query";
import { realtime, EVENTS } from "../lib/realtime";
import type { Capability } from "../lib/constants";
import { useAuth } from "./AuthProvider";

const ACTIVE_KEY = "tusker.active-workspace";

type WorkspaceContextValue = {
    workspaceId: string;
    workspace: WorkspaceSummary | undefined;
    workspaces: WorkspaceSummary[];
    layout: WorkspaceLayout | undefined;
    isLoading: boolean;
    permissions: WorkspaceLayout["permissions"] | undefined;
    role: string | null;
    isAdmin: boolean;
    /** apps/web sidebar: `can(capabilities, "procurement:view")`. */
    can: (capability: Capability) => boolean;
    switchWorkspace: (id: string) => void;
    refetchLayout: () => void;
};

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

/**
 * The active workspace and its layout payload — the same one call
 * (GET /workspaces/:id/layout) the web shell renders the sidebar from:
 * permissions, workspaces, projects, tags, unread count and broadcasts.
 */
export function WorkspaceProvider({ children }: { children: ReactNode }) {
    const auth = useAuth();
    const qc = useQueryClient();
    const [workspaceId, setWorkspaceId] = useState<string | null>(null);
    const [restored, setRestored] = useState(false);

    const listQuery = useQuery({
        queryKey: qk.workspaces(),
        queryFn: workspacesApi.list,
        enabled: auth.status === "signedIn",
    });
    const workspaces = listQuery.data?.workspaces ?? [];

    useEffect(() => {
        AsyncStorage.getItem(ACTIVE_KEY)
            .then((id) => id && setWorkspaceId(id))
            .finally(() => setRestored(true));
    }, []);

    // Fall back to the first workspace when the remembered one is gone.
    useEffect(() => {
        if (!restored || !listQuery.data) return;
        if (!workspaceId || !workspaces.some((w) => w.id === workspaceId)) {
            const first = workspaces[0]?.id ?? null;
            setWorkspaceId(first);
            if (first) AsyncStorage.setItem(ACTIVE_KEY, first).catch(() => {});
        }
    }, [restored, listQuery.data, workspaceId, workspaces]);

    const layoutQuery = useQuery({
        queryKey: qk.layout(workspaceId ?? ""),
        queryFn: () => workspacesApi.layout(workspaceId!),
        enabled: auth.status === "signedIn" && !!workspaceId,
    });

    // Realtime subscriptions follow the active workspace, like pubsub.init on web.
    useEffect(() => {
        if (auth.status !== "signedIn" || !workspaceId) return;
        realtime.init(workspaceId, auth.user.id || null);
        const offTeam = realtime.subscribe(EVENTS.TEAM_UPDATE, (data) => {
            const action = String(data?.action ?? "").toUpperCase();
            if (action.includes("PROJECT") || action.includes("MEMBER") || action.includes("TAG") || action.includes("BROADCAST")) {
                qc.invalidateQueries({ queryKey: qk.layout(workspaceId) });
            }
        });
        const offActivity = realtime.subscribe(EVENTS.APP_ACTIVITY_LOG, () => {
            qc.invalidateQueries({ queryKey: qk.notifications(workspaceId) });
            qc.invalidateQueries({ queryKey: qk.layout(workspaceId) });
        });
        const offNotification = realtime.subscribe(EVENTS.NOTIFICATION, () => {
            qc.invalidateQueries({ queryKey: qk.notifications(workspaceId) });
            qc.invalidateQueries({ queryKey: qk.layout(workspaceId) });
        });

        presenceApi.heartbeat(workspaceId);
        const heartbeat = setInterval(() => presenceApi.heartbeat(workspaceId), 60_000);

        return () => {
            offTeam();
            offActivity();
            offNotification();
            clearInterval(heartbeat);
        };
    }, [auth.status, auth.user?.id, workspaceId, qc]);

    useEffect(() => {
        if (auth.status === "signedOut") realtime.stop();
    }, [auth.status]);

    const switchWorkspace = useCallback(
        (id: string) => {
            setWorkspaceId(id);
            AsyncStorage.setItem(ACTIVE_KEY, id).catch(() => {});
        },
        [],
    );

    const value = useMemo<WorkspaceContextValue>(() => {
        const layout = layoutQuery.data;
        const permissions = layout?.permissions;
        const caps = permissions?.capabilities ?? {};
        const role = permissions?.workspaceRole ?? workspaces.find((w) => w.id === workspaceId)?.workspaceRole ?? null;
        return {
            workspaceId: workspaceId ?? "",
            workspace: workspaces.find((w) => w.id === workspaceId),
            workspaces: layout?.workspaces?.workspaces ?? workspaces,
            layout,
            isLoading: listQuery.isLoading || (!!workspaceId && layoutQuery.isLoading),
            permissions,
            role,
            isAdmin: !!permissions?.isWorkspaceAdmin || role === "OWNER" || role === "ADMIN",
            can: (capability) => caps[capability] === true,
            switchWorkspace,
            refetchLayout: () => layoutQuery.refetch(),
        };
    }, [layoutQuery.data, layoutQuery.isLoading, listQuery.isLoading, workspaces, workspaceId, switchWorkspace, layoutQuery]);

    return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}

export function useWorkspace() {
    const ctx = useContext(WorkspaceContext);
    if (!ctx) throw new Error("useWorkspace must be used inside WorkspaceProvider");
    return ctx;
}

/** True once we know whether the person has any workspace at all. */
export function useHasWorkspaces() {
    const { workspaces, isLoading } = useWorkspace();
    return { ready: !isLoading, hasAny: workspaces.length > 0 };
}
