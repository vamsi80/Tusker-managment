import { useEffect } from "react";
import { HashRouter, Navigate, Route, Routes, useNavigate } from "react-router";
import { Loader2, WifiOff } from "lucide-react";
import { workspacesApi } from "@mobile/api/workspaces";
import { AuthProvider, useAuth } from "~/providers/AuthProvider";
import { SignInScreen } from "~/screens/SignInScreen";
import { SettingsScreen, useOnline } from "~/screens/SettingsScreen";
import { pusherClient } from "~/overrides/core/lib/pusher";
import { clientPage, serverPage } from "~/next/server-component";

/**
 * The website's own pages, at the website's own paths (apps/web/src/app/w/...).
 * "use client" pages run as they are; server pages and layouts run through
 * serverPage(), with their server-only data calls swapped for API-backed ones.
 */
const page = {
    workspaceLayout: serverPage(() => import("../../web/src/app/w/[workspaceId]/layout"), { layout: true }),
    dashboard: clientPage(() => import("../../web/src/app/w/[workspaceId]/page")),
    calendar: clientPage(() => import("../../web/src/app/w/[workspaceId]/calendar/page")),
    projects: clientPage(() => import("../../web/src/app/w/[workspaceId]/p/page")),
    createProject: clientPage(() => import("../../web/src/app/w/[workspaceId]/createProject/page")),
    editProjects: clientPage(() => import("../../web/src/app/w/[workspaceId]/editProject/page")),
    editProject: clientPage(() => import("../../web/src/app/w/[workspaceId]/editProject/[projectId]/page")),
    projectSettings: clientPage(() => import("../../web/src/app/w/[workspaceId]/projectSettings/[projectId]/page")),
    myspaceLayout: clientPage(() => import("../../web/src/app/w/[workspaceId]/myspace/layout"), { layout: true }),
    myspace: clientPage(() => import("../../web/src/app/w/[workspaceId]/myspace/page")),
    todo: clientPage(() => import("../../web/src/app/w/[workspaceId]/myspace/to-do/page")),
    conversationsLayout: clientPage(() => import("../../web/src/app/w/[workspaceId]/myspace/conversations/layout"), { layout: true }),
    conversations: clientPage(() => import("../../web/src/app/w/[workspaceId]/myspace/conversations/page")),
    conversation: clientPage(() => import("../../web/src/app/w/[workspaceId]/myspace/conversations/[conversationId]/page")),
    notificationsLayout: clientPage(() => import("../../web/src/app/w/[workspaceId]/notifications/layout"), { layout: true }),
    notifications: clientPage(() => import("../../web/src/app/w/[workspaceId]/notifications/page")),
    notification: clientPage(() => import("../../web/src/app/w/[workspaceId]/notifications/[notificationId]/page")),
    vendors: clientPage(() => import("../../web/src/app/w/[workspaceId]/vendors/page")),
    vendor: clientPage(() => import("../../web/src/app/w/[workspaceId]/vendors/[vendorId]/page")),
    vendorNew: clientPage(() => import("../../web/src/app/w/[workspaceId]/vendors/new/page")),
    vendorEdit: clientPage(() => import("../../web/src/app/w/[workspaceId]/vendors/[vendorId]/edit/page")),
    tasksLayout: serverPage(() => import("../../web/src/app/w/[workspaceId]/tasks/layout"), { layout: true }),
    tasks: serverPage(() => import("../../web/src/app/w/[workspaceId]/tasks/page")),
    teamLayout: serverPage(() => import("../../web/src/app/w/[workspaceId]/team/layout"), { layout: true }),
    team: serverPage(() => import("../../web/src/app/w/[workspaceId]/team/page")),
    attendance: serverPage(() => import("../../web/src/app/w/[workspaceId]/team/attendance/page")),
    leaves: serverPage(() => import("../../web/src/app/w/[workspaceId]/team/leaves/page")),
    points: serverPage(() => import("../../web/src/app/w/[workspaceId]/team/points/page")),
    teamSettings: serverPage(() => import("../../web/src/app/w/[workspaceId]/team/settings/page")),
    reports: serverPage(() => import("../../web/src/app/w/[workspaceId]/reports/page")),
    info: serverPage(() => import("../../web/src/app/w/[workspaceId]/info/page")),
    myBoard: serverPage(() => import("../../web/src/app/w/[workspaceId]/my-board/page")),
    settingsLayout: serverPage(() => import("../../web/src/app/w/[workspaceId]/settings/layout"), { layout: true }),
    settings: serverPage(() => import("../../web/src/app/w/[workspaceId]/settings/page")),
    activity: serverPage(() => import("../../web/src/app/w/[workspaceId]/settings/activity/page")),
    departments: serverPage(() => import("../../web/src/app/w/[workspaceId]/settings/departments/page")),
    permissions: serverPage(() => import("../../web/src/app/w/[workspaceId]/settings/permissions/page")),
    projectLayout: serverPage(() => import("../../web/src/app/w/[workspaceId]/p/[slug]/layout"), { layout: true }),
    project: serverPage(() => import("../../web/src/app/w/[workspaceId]/p/[slug]/page")),
    projectDashboard: serverPage(() => import("../../web/src/app/w/[workspaceId]/p/[slug]/dashboard/page")),
    projectList: serverPage(() => import("../../web/src/app/w/[workspaceId]/p/[slug]/list/page")),
    projectKanban: serverPage(() => import("../../web/src/app/w/[workspaceId]/p/[slug]/kanban/page")),
    projectGantt: serverPage(() => import("../../web/src/app/w/[workspaceId]/p/[slug]/gantt/page")),
    projectMaterials: serverPage(() => import("../../web/src/app/w/[workspaceId]/p/[slug]/materials/page")),
    projectProcurement: serverPage(() => import("../../web/src/app/w/[workspaceId]/p/[slug]/procurement/page")),
    createIndentInProject: serverPage(() => import("../../web/src/app/w/[workspaceId]/p/[slug]/procurement/create-indent/page")),
    procurementLayout: serverPage(() => import("../../web/src/app/w/[workspaceId]/procurement/layout"), { layout: true }),
    procurement: serverPage(() => import("../../web/src/app/w/[workspaceId]/procurement/page")),
    indents: serverPage(() => import("../../web/src/app/w/[workspaceId]/procurement/indents/page")),
    indentCreate: serverPage(() => import("../../web/src/app/w/[workspaceId]/procurement/indents/create/page")),
    indent: serverPage(() => import("../../web/src/app/w/[workspaceId]/procurement/indents/[indentId]/page")),
    materials: serverPage(() => import("../../web/src/app/w/[workspaceId]/procurement/materials/page")),
    pos: serverPage(() => import("../../web/src/app/w/[workspaceId]/procurement/pos/page")),
    poNew: serverPage(() => import("../../web/src/app/w/[workspaceId]/procurement/pos/new/page")),
    po: serverPage(() => import("../../web/src/app/w/[workspaceId]/procurement/pos/[poId]/page")),
    rfqs: serverPage(() => import("../../web/src/app/w/[workspaceId]/procurement/rfqs/page")),
    rfqCreate: serverPage(() => import("../../web/src/app/w/[workspaceId]/procurement/rfqs/create/page")),
    vendorsLayout: serverPage(() => import("../../web/src/app/w/[workspaceId]/vendors/layout"), { layout: true }),
};

export function App() {
    return (
        <AuthProvider>
            <HashRouter>
                <Gate />
            </HashRouter>
        </AuthProvider>
    );
}

function Splash() {
    return (
        <div className="app-bg grid h-svh place-items-center">
            <Loader2 className="size-8 animate-spin text-primary-ink" />
        </div>
    );
}

/** An address inside a workspace that the website doesn't have either. */
function NotFound() {
    return (
        <div className="grid min-h-60 flex-1 place-items-center p-6 text-center text-sm text-muted-foreground">
            This page doesn't exist. Use the sidebar to find what you need.
        </div>
    );
}

const ACTIVE_KEY = "tusker.active-workspace";

/** "/" → the last workspace used, else the first one (the website's /w redirect). */
function WorkspaceRedirect() {
    const navigate = useNavigate();
    useEffect(() => {
        let cancelled = false;
        workspacesApi
            .list()
            .then(({ workspaces }) => {
                if (cancelled) return;
                const saved = localStorage.getItem(ACTIVE_KEY);
                const id = workspaces.find((w) => w.id === saved)?.id ?? workspaces[0]?.id;
                navigate(id ? `/w/${id}` : "/no-workspace", { replace: true });
            })
            .catch(() => {
                const saved = localStorage.getItem(ACTIVE_KEY);
                if (!cancelled && saved) navigate(`/w/${saved}`, { replace: true }); // offline: last workspace, from cache
            });
        return () => {
            cancelled = true;
        };
    }, [navigate]);
    return <Splash />;
}

function RememberWorkspace() {
    useEffect(() => {
        const match = window.location.hash.match(/^#\/w\/([^/?#]+)/);
        if (match) localStorage.setItem(ACTIVE_KEY, match[1]);
    });
    return null;
}

/**
 * What the app adds around the website's pages: a Windows notification for new
 * notifications while Tusker isn't the focused window (the website shows a toast
 * in the page), and a banner while offline. The Pusher client is the same one the
 * website's code uses (src/overrides/core/lib/pusher.ts), so no second connection.
 */
function DesktopExtras({ userId }: { userId: string }) {
    const online = useOnline();
    useEffect(() => {
        if (!pusherClient) return;
        const channel = pusherClient.subscribe(`user-${userId}`);
        const onNotification = (data: { title?: string; body?: string }) => {
            if (data?.title && !document.hasFocus()) window.tusker.notify(data.title, data.body ?? "");
        };
        channel.bind("new_notification", onNotification);
        // Unbind only: the website's realtime listener shares this channel.
        return () => {
            channel.unbind("new_notification", onNotification);
        };
    }, [userId]);

    if (online) return null;
    return (
        <div role="status" className="fixed bottom-4 left-1/2 z-[100] flex -translate-x-1/2 items-center gap-2 rounded-full bg-amber-500/95 px-4 py-2 text-sm font-medium text-amber-950 shadow-lg">
            <WifiOff className="size-4" />
            Offline: showing your saved data. Changes need a connection.
        </div>
    );
}

function Gate() {
    const auth = useAuth();
    if (auth.status === "loading") return <Splash />;
    if (auth.status === "signedOut") return <SignInScreen />;

    return (
        <>
            <RememberWorkspace />
            <DesktopExtras userId={auth.user.id} />
            <Routes>
                <Route path="/" element={<WorkspaceRedirect />} />
                <Route path="/sign-in" element={<Navigate to="/" replace />} />
                <Route
                    path="/no-workspace"
                    element={
                        <div className="app-bg grid h-svh place-items-center p-6 text-center text-sm text-muted-foreground">
                            You aren't in a workspace yet. Ask your admin for an invite, then reopen Tusker.
                        </div>
                    }
                />
                <Route path="/w/:workspaceId" element={<page.workspaceLayout />}>
                    <Route index element={<page.dashboard />} />
                    <Route path="calendar" element={<page.calendar />} />
                    <Route path="p" element={<page.projects />} />
                    <Route path="createProject" element={<page.createProject />} />
                    <Route path="editProject" element={<page.editProjects />} />
                    <Route path="editProject/:projectId" element={<page.editProject />} />
                    <Route path="projectSettings/:projectId" element={<page.projectSettings />} />
                    <Route path="myspace" element={<page.myspaceLayout />}>
                        <Route index element={<page.myspace />} />
                        <Route path="to-do" element={<page.todo />} />
                        <Route path="conversations" element={<page.conversationsLayout />}>
                            <Route index element={<page.conversations />} />
                            <Route path=":conversationId" element={<page.conversation />} />
                        </Route>
                    </Route>
                    <Route path="notifications" element={<page.notificationsLayout />}>
                        <Route index element={<page.notifications />} />
                        <Route path=":notificationId" element={<page.notification />} />
                    </Route>
                    <Route path="vendors" element={<page.vendorsLayout />}>
                        <Route index element={<page.vendors />} />
                        <Route path="new" element={<page.vendorNew />} />
                        <Route path=":vendorId" element={<page.vendor />} />
                        <Route path=":vendorId/edit" element={<page.vendorEdit />} />
                    </Route>
                    <Route path="tasks" element={<page.tasksLayout />}>
                        <Route index element={<page.tasks />} />
                    </Route>
                    <Route path="team" element={<page.teamLayout />}>
                        <Route index element={<page.team />} />
                        <Route path="attendance" element={<page.attendance />} />
                        <Route path="leaves" element={<page.leaves />} />
                        <Route path="points" element={<page.points />} />
                        <Route path="settings" element={<page.teamSettings />} />
                    </Route>
                    <Route path="reports" element={<page.reports />} />
                    <Route path="info" element={<page.info />} />
                    <Route path="my-board" element={<page.myBoard />} />
                    <Route path="settings" element={<page.settingsLayout />}>
                        <Route index element={<page.settings />} />
                        <Route path="activity" element={<page.activity />} />
                        <Route path="departments" element={<page.departments />} />
                        <Route path="permissions" element={<page.permissions />} />
                    </Route>
                    <Route path="p/:slug" element={<page.projectLayout />}>
                        <Route index element={<page.project />} />
                        <Route path="dashboard" element={<page.projectDashboard />} />
                        <Route path="list" element={<page.projectList />} />
                        <Route path="kanban" element={<page.projectKanban />} />
                        <Route path="gantt" element={<page.projectGantt />} />
                        <Route path="materials" element={<page.projectMaterials />} />
                        <Route path="procurement" element={<page.projectProcurement />} />
                        <Route path="procurement/create-indent" element={<page.createIndentInProject />} />
                    </Route>
                    <Route path="procurement" element={<page.procurementLayout />}>
                        <Route index element={<page.procurement />} />
                        <Route path="indents" element={<page.indents />} />
                        <Route path="indents/create" element={<page.indentCreate />} />
                        <Route path="indents/:indentId" element={<page.indent />} />
                        <Route path="materials" element={<page.materials />} />
                        <Route path="pos" element={<page.pos />} />
                        <Route path="pos/new" element={<page.poNew />} />
                        <Route path="pos/:poId" element={<page.po />} />
                        <Route path="rfqs" element={<page.rfqs />} />
                        <Route path="rfqs/create" element={<page.rfqCreate />} />
                    </Route>
                    <Route path="app-settings" element={<SettingsScreen />} />
                    <Route path="*" element={<NotFound />} />
                </Route>
                <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
        </>
    );
}
