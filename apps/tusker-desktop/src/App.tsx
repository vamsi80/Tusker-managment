import { HashRouter, Route, Routes } from "react-router";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { Loader2 } from "lucide-react";
import { CACHE_MAX_AGE, persister, queryClient } from "~/lib/query";
import { AuthProvider, useAuth } from "~/providers/AuthProvider";
import { WorkspaceProvider, useWorkspace } from "~/providers/WorkspaceProvider";
import { AppShell } from "~/shell/AppShell";
import { SignInScreen } from "~/screens/SignInScreen";
import { DashboardScreen } from "~/screens/DashboardScreen";
import { TasksScreen } from "~/screens/TasksScreen";
import { NotificationsScreen } from "~/screens/NotificationsScreen";

export function App() {
    return (
        <PersistQueryClientProvider client={queryClient} persistOptions={{ persister, maxAge: CACHE_MAX_AGE }}>
            <AuthProvider>
                <HashRouter>
                    <Gate />
                </HashRouter>
            </AuthProvider>
        </PersistQueryClientProvider>
    );
}

function Splash() {
    return (
        <div className="app-bg grid h-svh place-items-center">
            <Loader2 className="size-8 animate-spin text-primary-ink" />
        </div>
    );
}

function Gate() {
    const auth = useAuth();
    if (auth.status === "loading") return <Splash />;
    if (auth.status === "signedOut") return <SignInScreen />;
    return (
        <WorkspaceProvider>
            <WorkspaceGate />
        </WorkspaceProvider>
    );
}

function WorkspaceGate() {
    const { workspaceId, isLoading } = useWorkspace();
    if (!workspaceId) {
        return isLoading ? (
            <Splash />
        ) : (
            <div className="app-bg grid h-svh place-items-center p-6 text-center text-sm text-muted-foreground">
                You aren't in a workspace yet. Ask your admin for an invite, then reopen Tusker.
            </div>
        );
    }
    return (
        <Routes>
            <Route element={<AppShell />}>
                <Route index element={<DashboardScreen />} />
                <Route path="tasks" element={<TasksScreen />} />
                <Route path="notifications" element={<NotificationsScreen />} />
                <Route path="*" element={<DashboardScreen />} />
            </Route>
        </Routes>
    );
}
