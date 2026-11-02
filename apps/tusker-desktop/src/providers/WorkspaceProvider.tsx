import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { workspacesApi, type WorkspaceLayout, type WorkspaceSummary } from "@mobile/api/workspaces";
import { presenceApi } from "@mobile/api/comms";
import { qk } from "~/lib/query";
import { DATA_EVENTS, startRealtime } from "~/lib/realtime";
import { useUser } from "./AuthProvider";

const ACTIVE_KEY = "tusker.active-workspace";

type WorkspaceContextValue = {
    workspaceId: string;
    workspaces: WorkspaceSummary[];
    layout: WorkspaceLayout | undefined;
    isLoading: boolean;
    isAdmin: boolean;
    /** apps/web sidebar: `can(capabilities, "procurement:view")`. */
    can: (capability: string) => boolean;
    switchWorkspace: (id: string) => void;
};

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

/**
 * The active workspace and its layout payload: the same single call
 * (GET /workspaces/:id/layout) the web shell and the mobile app render from.
 * Ported from apps/mobile/src/providers/WorkspaceProvider.tsx.
 */
export function WorkspaceProvider({ children }: { children: ReactNode }) {
    const user = useUser();
    const qc = useQueryClient();
    const [workspaceId, setWorkspaceId] = useState<string | null>(() => localStorage.getItem(ACTIVE_KEY));

    const listQuery = useQuery({ queryKey: qk.workspaces(), queryFn: workspacesApi.list });
    const workspaces = listQuery.data?.workspaces ?? [];

    const switchWorkspace = useCallback((id: string) => {
        setWorkspaceId(id);
        localStorage.setItem(ACTIVE_KEY, id);
    }, []);

    // Fall back to the first workspace when the remembered one is gone.
    useEffect(() => {
        if (!listQuery.data) return;
        if (!workspaceId || !workspaces.some((w) => w.id === workspaceId)) {
            const first = workspaces[0]?.id;
            if (first) switchWorkspace(first);
        }
    }, [listQuery.data, workspaceId, workspaces, switchWorkspace]);

    const layoutQuery = useQuery({
        queryKey: qk.layout(workspaceId ?? ""),
        queryFn: () => workspacesApi.layout(workspaceId!),
        enabled: !!workspaceId,
    });

    // Live sync: the same events the website reacts to refetch what they touch.
    useEffect(() => {
        if (!workspaceId) return;
        const stop = startRealtime(workspaceId, user.id, (event, data) => {
            if (event === "new_notification" || event === "activity_log") {
                qc.invalidateQueries({ queryKey: qk.notifications(workspaceId) });
                qc.invalidateQueries({ queryKey: qk.layout(workspaceId) });
                if (event === "new_notification" && data.title) window.tusker.notify(data.title, data.body);
                return;
            }
            if (!DATA_EVENTS.includes(event)) return;
            qc.invalidateQueries({ queryKey: ["tasks", workspaceId] });
            qc.invalidateQueries({ queryKey: qk.reviews(workspaceId) });
            const action = String(data.action ?? data.type ?? "").toUpperCase();
            if (/PROJECT|MEMBER|TAG|BROADCAST/.test(action)) qc.invalidateQueries({ queryKey: qk.layout(workspaceId) });
        });

        // Presence, as the website and mobile app report it ("online" dots).
        presenceApi.heartbeat(workspaceId);
        const heartbeat = setInterval(() => presenceApi.heartbeat(workspaceId), 60_000);
        return () => {
            stop();
            clearInterval(heartbeat);
        };
    }, [workspaceId, user.id, qc]);

    const value = useMemo<WorkspaceContextValue>(() => {
        const layout = layoutQuery.data;
        const permissions = layout?.permissions;
        const caps: Record<string, boolean> = (permissions?.capabilities as Record<string, boolean>) ?? {};
        const role = permissions?.workspaceRole ?? workspaces.find((w) => w.id === workspaceId)?.workspaceRole ?? null;
        return {
            workspaceId: workspaceId ?? "",
            workspaces: layout?.workspaces?.workspaces ?? workspaces,
            layout,
            isLoading: listQuery.isLoading || (!!workspaceId && layoutQuery.isLoading),
            isAdmin: !!permissions?.isWorkspaceAdmin || role === "OWNER" || role === "ADMIN",
            can: (capability) => caps[capability] === true,
            switchWorkspace,
        };
    }, [layoutQuery.data, layoutQuery.isLoading, listQuery.isLoading, workspaces, workspaceId, switchWorkspace]);

    return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}

export function useWorkspace() {
    const ctx = useContext(WorkspaceContext);
    if (!ctx) throw new Error("useWorkspace must be used inside WorkspaceProvider");
    return ctx;
}
