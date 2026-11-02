import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { notificationsApi, type NotificationGroup } from "@mobile/api/comms";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { qk, useOnline } from "~/lib/query";
import { useWorkspace } from "~/providers/WorkspaceProvider";

export function NotificationsScreen() {
    const { workspaceId } = useWorkspace();
    const online = useOnline();
    const qc = useQueryClient();
    const query = useQuery({ queryKey: qk.notifications(workspaceId), queryFn: () => notificationsApi.list(workspaceId, null, 50) });

    const refresh = () => {
        qc.invalidateQueries({ queryKey: qk.notifications(workspaceId) });
        qc.invalidateQueries({ queryKey: qk.layout(workspaceId) }); // the sidebar's unread badge
    };
    const markAll = useMutation({ mutationFn: () => notificationsApi.markAllRead(workspaceId), onSettled: refresh });
    const markOne = useMutation({ mutationFn: (g: NotificationGroup) => notificationsApi.markRead(g.id ?? g.taskId), onSettled: refresh });

    const unread = query.data?.unreadNotifications ?? [];
    const read = query.data?.readNotifications ?? [];

    return (
        <>
            <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                    <h1 className="font-heading text-2xl font-bold tracking-tight sm:text-3xl">Notifications</h1>
                    <p className="mt-1 text-sm text-foreground/80">Comments, reviews and updates on your work.</p>
                </div>
                {unread.length > 0 && (
                    <Button variant="outline" disabled={!online || markAll.isPending} onClick={() => markAll.mutate()}>
                        Mark all as read
                    </Button>
                )}
            </div>

            {query.isLoading ? (
                <p className="text-sm text-muted-foreground">Loading…</p>
            ) : unread.length + read.length === 0 ? (
                <p className="py-12 text-center text-sm text-muted-foreground">You're all caught up.</p>
            ) : (
                <div className="flex max-w-3xl flex-col gap-2">
                    {[...unread, ...read].map((g, i) => (
                        <button
                            key={`${g.id ?? g.taskId}-${i}`}
                            type="button"
                            disabled={!g.isNew || !online}
                            onClick={() => markOne.mutate(g)}
                            className={cn(
                                "flex flex-col gap-1 rounded-2xl px-4 py-3 text-left shadow-xs transition-colors",
                                g.isNew ? "bg-card ring-1 ring-primary-ink/30 hover:bg-card/80" : "bg-card/60",
                            )}
                        >
                            <span className="flex items-center gap-2">
                                {g.isNew && <span className="size-2 shrink-0 rounded-full bg-primary" />}
                                <span className="truncate text-sm font-medium">{g.taskName}</span>
                                {g.count > 1 && <span className="text-xs text-muted-foreground">+{g.count - 1}</span>}
                                <span className="ml-auto shrink-0 text-xs text-muted-foreground">
                                    {g.latestComment?.createdAt ? formatDistanceToNow(new Date(g.latestComment.createdAt), { addSuffix: true }) : ""}
                                </span>
                            </span>
                            <span className="line-clamp-2 text-sm text-muted-foreground">
                                {g.latestComment?.user?.surname || g.latestComment?.user?.name ? `${g.latestComment.user.surname || g.latestComment.user.name}: ` : ""}
                                {g.latestComment?.content}
                            </span>
                            <span className="text-xs text-muted-foreground">{g.projectName}</span>
                        </button>
                    ))}
                </div>
            )}
        </>
    );
}
