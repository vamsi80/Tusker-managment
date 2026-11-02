import { useEffect } from "react";
import { HashRouter, Navigate, Route, Routes, useNavigate } from "react-router";
import { Loader2 } from "lucide-react";
import { workspacesApi } from "@mobile/api/workspaces";
import { AuthProvider, useAuth } from "~/providers/AuthProvider";
import { SignInScreen } from "~/screens/SignInScreen";
import { SettingsScreen } from "~/screens/SettingsScreen";
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

/** Pages this desktop build doesn't run yet (they still read the database directly on the website). */
function ComingSoon() {
    return (
        <div className="grid min-h-60 flex-1 place-items-center p-6 text-center text-sm text-muted-foreground">
            This page is coming to the desktop app soon. It's available on the website meanwhile.
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

function Gate() {
    const auth = useAuth();
    if (auth.status === "loading") return <Splash />;
    if (auth.status === "signedOut") return <SignInScreen />;

    return (
        <>
            <RememberWorkspace />
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
                    <Route path="vendors" element={<page.vendors />} />
                    <Route path="vendors/new" element={<page.vendorNew />} />
                    <Route path="vendors/:vendorId" element={<page.vendor />} />
                    <Route path="vendors/:vendorId/edit" element={<page.vendorEdit />} />
                    <Route path="app-settings" element={<SettingsScreen />} />
                    <Route path="*" element={<ComingSoon />} />
                </Route>
                <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
        </>
    );
}
