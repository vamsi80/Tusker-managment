"use client";

import { useCallback, useEffect, useState } from "react";
import { Megaphone, Pencil, Send, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { apiClient } from "@tusker/api-client";
import { toast } from "@/lib/toast";
import { pubsub, EVENTS } from "@/lib/pubsub";
import { cn } from "@/lib/utils";
import { listDepartments } from "@/actions/department/department-actions";
import type { Broadcast } from "@tusker/api-client/workspaces";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

/**
 * Workspace announcements. Everyone reads; only owners/admins can post
 * (the API enforces it too — this only hides the composer).
 */
/** How long a new broadcast stays on the dashboard. "0" means it never expires. */
const VISIBILITY_OPTIONS = [
  { value: "24", label: "Visible for 1 day" },
  { value: "72", label: "Visible for 3 days" },
  { value: "168", label: "Visible for 1 week" },
  { value: "720", label: "Visible for 30 days" },
  { value: "0", label: "Visible until removed" },
];

/**
 * The workspace's live broadcast list. Both the card and the dashboard ticker
 * read from here so a newly posted announcement lands in both at once.
 */
function useBroadcasts(workspaceId: string, initialBroadcasts?: Broadcast[]) {
  const [fetched, setFetched] = useState<Broadcast[] | null>(null);

  // Anything this hook fetched itself wins; otherwise show what the layout
  // already delivered, and only go to the network when it delivered nothing.
  const broadcasts = fetched ?? initialBroadcasts ?? null;

  const load = useCallback(() => {
    apiClient.workspaces
      .getBroadcasts(workspaceId, 10)
      .then(setFetched)
      .catch(() => setFetched([]));
  }, [workspaceId]);

  useEffect(() => {
    if (!initialBroadcasts) load();

    // A new broadcast arrives as a team update — refresh instead of polling.
    return pubsub.subscribe(EVENTS.TEAM_UPDATE, (data: any) => {
      if (typeof data?.action === "string" && data.action.startsWith("BROADCAST_")) load();
    });
    // `initialBroadcasts` is only consulted for the first paint; later layout
    // revalidations must not trigger another fetch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [load]);

  return { broadcasts, load };
}

/**
 * News-channel ticker for the dashboard banner: every live announcement on one
 * line, scrolling right to left and wrapping around. The track renders the list
 * twice so the loop has no visible seam; hovering pauses it so it can be read.
 */
export function BroadcastTicker({
  workspaceId,
  initialBroadcasts,
}: {
  workspaceId: string;
  initialBroadcasts?: Broadcast[];
}) {
  const { broadcasts } = useBroadcasts(workspaceId, initialBroadcasts);
  const items = broadcasts ?? [];

  if (items.length === 0) return null;

  const messages = items.map((b) =>
    b.title && b.title !== "Announcement" ? `${b.title} — ${b.body}` : b.body
  );

  // One short announcement would leave dead space between the two copies of the
  // track, so repeat the list until it is at least banner-wide first.
  // ponytail: 140 chars stands in for the banner width, no measuring involved.
  const line = Array.from(
    { length: Math.max(1, Math.ceil(140 / Math.max(1, messages.join("").length))) },
    () => messages
  ).flat();

  // Pace it by content, not a fixed duration: a long line at a short duration
  // is unreadable, a short line at a long one looks frozen. ~9 chars a second.
  const seconds = Math.max(20, line.join("").length / 9);

  const run = (key: string) => (
    <span key={key} className="flex shrink-0 items-center" aria-hidden={key === "b"}>
      {line.map((m, i) => (
        <span key={i} className="flex items-center">
          <span className="px-4 text-sm font-medium text-foreground">{m}</span>
          <span className="text-primary/50">•</span>
        </span>
      ))}
    </span>
  );

  return (
    <div className="broadcast-ticker flex min-w-0 flex-1 items-center overflow-hidden rounded-2xl border bg-card shadow-xs">
      <span className="flex shrink-0 items-center gap-1.5 self-stretch rounded-l-2xl bg-rose-600 px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-white">
        <Megaphone className="size-3.5" />
        Broadcast
      </span>
      <div className="min-w-0 flex-1 overflow-hidden">
        <div className="broadcast-ticker-track" style={{ animationDuration: `${seconds}s` }}>
          {run("a")}
          {run("b")}
        </div>
      </div>
    </div>
  );
}

export function BroadcastWidget({
  workspaceId,
  canBroadcast,
  initialBroadcasts,
}: {
  workspaceId: string;
  canBroadcast: boolean;
  /** Comes down with the workspace layout payload, so the box usually never fetches. */
  initialBroadcasts?: Broadcast[];
}) {
  const { broadcasts, load } = useBroadcasts(workspaceId, initialBroadcasts);
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [visibleFor, setVisibleFor] = useState("168");
  const [isSending, setIsSending] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Broadcast | null>(null);
  const [departments, setDepartments] = useState<{ id: string; name: string }[]>([]);
  /** Empty means the whole workspace, which is what an unaddressed broadcast has always meant. */
  const [deptIds, setDeptIds] = useState<string[]>([]);

  useEffect(() => {
    if (!canBroadcast) return;
    listDepartments(workspaceId)
      .then((res) => setDepartments(res.data ?? []))
      .catch(() => setDepartments([]));
  }, [workspaceId, canBroadcast]);

  const toggleDept = (id: string) =>
    setDeptIds((prev) => (prev.includes(id) ? prev.filter((d) => d !== id) : [...prev, id]));

  const resetComposer = () => {
    setEditingId(null);
    setTitle("");
    setMessage("");
    setVisibleFor("168");
    setDeptIds([]);
  };

  /** Editing reuses the composer; the pill's own id is per-member, so address the broadcast. */
  const startEditing = (b: Broadcast) => {
    if (!b.entityId) return;
    setEditingId(b.entityId);
    setTitle(b.title === "Announcement" ? "" : b.title);
    setMessage(b.body);
    setVisibleFor(b.metadata?.expiresAt ? visibleFor : "0");
  };

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim()) return;

    setIsSending(true);
    try {
      const values = {
        title: title.trim() || undefined,
        message: message.trim(),
        expiresInHours: visibleFor === "0" ? null : Number(visibleFor),
        departmentIds: deptIds,
      };

      if (editingId) {
        await apiClient.workspaces.updateBroadcast(workspaceId, editingId, values);
        toast.success("Broadcast updated");
      } else {
        await apiClient.workspaces.postBroadcast(workspaceId, values);
        toast.success(
          deptIds.length
            ? `Broadcast sent to ${deptIds.length} department${deptIds.length > 1 ? "s" : ""}`
            : "Broadcast sent to the workspace"
        );
      }

      resetComposer();
      load();
    } catch (error: any) {
      toast.error(error?.message || "Failed to save broadcast");
    } finally {
      setIsSending(false);
    }
  };

  const handleDelete = async () => {
    const broadcastId = pendingDelete?.entityId;
    setPendingDelete(null);
    if (!broadcastId) return;

    try {
      await apiClient.workspaces.deleteBroadcast(workspaceId, broadcastId);
      if (editingId === broadcastId) resetComposer();
      toast.success("Broadcast deleted");
      load();
    } catch (error: any) {
      toast.error(error?.message || "Failed to delete broadcast");
    }
  };

  return (
    <div className="flex flex-col p-6 rounded-2xl border bg-card text-card-foreground shadow-sm h-full">
      <div className="flex items-center justify-between mb-5">
        <div className="flex flex-col gap-1">
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
            Broadcast
          </h3>
          <span className="text-xs text-muted-foreground">Workspace announcements</span>
        </div>
        <div className="p-1.5 rounded-xl bg-amber-500/10 text-amber-500">
          <Megaphone className="size-4.5" />
        </div>
      </div>

      {canBroadcast && (
        <form onSubmit={handleSend} className="space-y-2 mb-4">
          <Input
            placeholder="Title (optional)"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={120}
            className="h-9 rounded-xl text-sm"
          />
          {!editingId && departments.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={() => setDeptIds([])}
                className={cn(
                  "px-2.5 py-1 rounded-lg border text-xs font-semibold transition-colors",
                  deptIds.length === 0
                    ? "bg-primary text-primary-foreground border-primary"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                Everyone
              </button>
              {departments.map((d) => (
                <button
                  key={d.id}
                  type="button"
                  onClick={() => toggleDept(d.id)}
                  className={cn(
                    "px-2.5 py-1 rounded-lg border text-xs font-semibold transition-colors",
                    deptIds.includes(d.id)
                      ? "bg-primary text-primary-foreground border-primary"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  {d.name}
                </button>
              ))}
            </div>
          )}
          <Textarea
            placeholder={
              deptIds.length
                ? "Write a message for the selected departments…"
                : "Write a message for everyone in this workspace…"
            }
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            maxLength={2000}
            className="rounded-xl min-h-[70px] resize-none text-sm"
          />
          <Select value={visibleFor} onValueChange={setVisibleFor}>
            <SelectTrigger className="h-9 rounded-xl text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="rounded-xl">
              {VISIBILITY_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="flex gap-2">
            <Button
              type="submit"
              size="sm"
              disabled={isSending || !message.trim()}
              className="rounded-xl gap-1.5 font-semibold flex-1"
            >
              <Send className="size-3.5" />
              {isSending
                ? "Saving…"
                : editingId
                ? "Save changes"
                : deptIds.length
                ? `Send to ${deptIds.length} department${deptIds.length > 1 ? "s" : ""}`
                : "Send to everyone"}
            </Button>
            {editingId && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={resetComposer}
                disabled={isSending}
                className="rounded-xl"
                title="Cancel editing"
              >
                <X className="size-3.5" />
              </Button>
            )}
          </div>
        </form>
      )}

      <div className="flex-1 overflow-auto max-h-[320px] pr-1">
        {broadcasts === null ? (
          <div className="space-y-3">
            {[0, 1].map((i) => (
              <div key={i} className="h-12 rounded-xl bg-muted/40 animate-pulse" />
            ))}
          </div>
        ) : broadcasts.length === 0 ? (
          <p className="text-sm italic text-muted-foreground/60 py-6 text-center">
            No announcements yet
          </p>
        ) : (
          <div className="divide-y divide-border">
            {broadcasts.map((b) => (
              <div key={b.id} className="py-3 first:pt-0 last:pb-0">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-sm font-semibold text-foreground truncate">{b.title}</span>
                  <span className="flex items-center gap-1 shrink-0">
                    <span className="text-[11px] text-muted-foreground">
                      {new Date(b.createdAt).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                      })}
                    </span>
                    {canBroadcast && b.entityId && (
                      <>
                        <button
                          type="button"
                          onClick={() => startEditing(b)}
                          title="Edit broadcast"
                          className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                        >
                          <Pencil className="size-3" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setPendingDelete(b)}
                          title="Delete broadcast"
                          className="p-1 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                        >
                          <Trash2 className="size-3" />
                        </button>
                      </>
                    )}
                  </span>
                </div>
                <p className="text-sm text-muted-foreground mt-0.5 whitespace-pre-wrap break-words">
                  {b.body}
                </p>
                <span className="text-[11px] text-muted-foreground/70">
                  {b.metadata?.senderName ? `— ${b.metadata.senderName}` : ""}
                  {!!b.metadata?.departmentNames?.length &&
                    ` · to ${b.metadata.departmentNames.join(", ")}`}
                  {b.metadata?.expiresAt &&
                    ` · until ${new Date(b.metadata.expiresAt).toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                    })}`}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      <AlertDialog open={!!pendingDelete} onOpenChange={(open) => !open && setPendingDelete(null)}>
        <AlertDialogContent className="rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this broadcast?</AlertDialogTitle>
            <AlertDialogDescription>
              It disappears for everyone in the workspace. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-xl">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="rounded-xl bg-destructive text-white hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
