import { NavLink, Outlet } from "react-router";
import { Bell, CheckSquare, LayoutDashboard, LogOut, Settings, WifiOff } from "lucide-react";
import { cn } from "@/lib/utils";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { useOnline } from "~/lib/query";
import { useAuth, useUser } from "~/providers/AuthProvider";
import { useWorkspace } from "~/providers/WorkspaceProvider";

const NAV = [
    { to: "/", label: "Dashboard", icon: LayoutDashboard, end: true },
    { to: "/tasks", label: "Tasks", icon: CheckSquare },
    { to: "/notifications", label: "Notifications", icon: Bell, badge: "unread" as const },
    { to: "/settings", label: "Settings", icon: Settings },
];

/**
 * Fixed frame, fluid content, the same as the website: the sidebar is a full
 * menu from 1280px and an icon rail below it (Gmail/Outlook), and pages lay
 * themselves out from the space they get (@container/main).
 */
export function AppShell() {
    const user = useUser();
    const { signOut } = useAuth();
    const online = useOnline();
    const { workspaceId, workspaces, layout, switchWorkspace } = useWorkspace();
    const unread = layout?.unreadNotificationsCount ?? 0;

    return (
        <div className="app-bg flex h-svh overflow-hidden text-foreground">
            <aside className="flex w-64 shrink-0 flex-col gap-4 border-r border-border/50 p-3 max-xl:w-16 max-xl:items-center">
                <div className="flex items-center gap-2 px-2 pt-2 font-heading text-lg font-bold tracking-tight">
                    <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-primary text-primary-foreground">T</span>
                    <span className="max-xl:hidden">TUSKERLANE</span>
                </div>

                {workspaces.length > 1 && (
                    <div className="max-xl:hidden">
                        <Select value={workspaceId} onValueChange={switchWorkspace}>
                            <SelectTrigger className="w-full">
                                <SelectValue placeholder="Workspace" />
                            </SelectTrigger>
                            <SelectContent>
                                {workspaces.map((w) => (
                                    <SelectItem key={w.id} value={w.id}>
                                        {w.name}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                )}

                <nav className="flex flex-1 flex-col gap-1">
                    {NAV.map(({ to, label, icon: Icon, end, badge }) => (
                        <NavLink
                            key={to}
                            to={to}
                            end={end}
                            title={label}
                            className={({ isActive }) =>
                                cn(
                                    "relative flex items-center gap-3 rounded-full px-3 py-2 text-sm font-medium transition-colors max-xl:justify-center max-xl:px-2",
                                    isActive ? "bg-card shadow-xs" : "text-foreground/80 hover:bg-card/60",
                                )
                            }
                        >
                            <Icon className="size-5 shrink-0" />
                            <span className="max-xl:hidden">{label}</span>
                            {badge === "unread" && unread > 0 && (
                                <span className="ml-auto rounded-full bg-primary px-1.5 text-[11px] font-semibold text-primary-foreground max-xl:absolute max-xl:-right-0.5 max-xl:-top-0.5">
                                    {unread > 99 ? "99+" : unread}
                                </span>
                            )}
                        </NavLink>
                    ))}
                </nav>

                <div className="flex items-center gap-2 rounded-2xl bg-card/70 p-2 max-xl:flex-col">
                    <span className="grid size-8 shrink-0 place-items-center rounded-full bg-muted text-sm font-semibold">
                        {(user.surname || user.name || "?").charAt(0).toUpperCase()}
                    </span>
                    <span className="min-w-0 flex-1 max-xl:hidden">
                        <span className="block truncate text-sm font-medium">{user.surname || user.name}</span>
                        <span className="block truncate text-xs text-muted-foreground">{user.email}</span>
                    </span>
                    <button type="button" onClick={signOut} title="Sign out" className="rounded-full p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground">
                        <LogOut className="size-4" />
                    </button>
                </div>
            </aside>

            <main className="flex min-w-0 flex-1 flex-col">
                {!online && (
                    <div className="flex shrink-0 items-center gap-2 bg-amber-500/15 px-6 py-2 text-sm text-amber-800 dark:text-amber-300">
                        <WifiOff className="size-4" />
                        Offline: showing your saved data. Changes need a connection.
                    </div>
                )}
                <div className="@container/main min-h-0 flex-1 overflow-y-auto">
                    <div className="flex flex-col gap-6 px-4 pb-8 pt-6 sm:px-6 lg:px-8">
                        <Outlet />
                    </div>
                </div>
            </main>
        </div>
    );
}
