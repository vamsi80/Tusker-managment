"use client";

import { useCallback, useEffect, useState } from "react";
import { Megaphone, Send } from "lucide-react";
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
import { apiClient } from "@/lib/api-client";
import { toast } from "@/lib/toast";
import { pubsub, EVENTS } from "@/lib/pubsub";
import type { Broadcast } from "@/lib/api-client/workspaces";

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

export function BroadcastWidget({
  workspaceId,
  canBroadcast,
}: {
  workspaceId: string;
  canBroadcast: boolean;
}) {
  const [broadcasts, setBroadcasts] = useState<Broadcast[] | null>(null);
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [visibleFor, setVisibleFor] = useState("168");
  const [isSending, setIsSending] = useState(false);

  const load = useCallback(() => {
    apiClient.workspaces
      .getBroadcasts(workspaceId, 10)
      .then(setBroadcasts)
      .catch(() => setBroadcasts([]));
  }, [workspaceId]);

  useEffect(() => {
    load();
    // A new broadcast arrives as a team update — refresh instead of polling.
    return pubsub.subscribe(EVENTS.TEAM_UPDATE, (data: any) => {
      if (data?.action === "BROADCAST_CREATED") load();
    });
  }, [load]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim()) return;

    setIsSending(true);
    try {
      await apiClient.workspaces.postBroadcast(workspaceId, {
        title: title.trim() || undefined,
        message: message.trim(),
        expiresInHours: visibleFor === "0" ? null : Number(visibleFor),
      });
      setTitle("");
      setMessage("");
      toast.success("Broadcast sent to the workspace");
      load();
    } catch (error: any) {
      toast.error(error?.message || "Failed to send broadcast");
    } finally {
      setIsSending(false);
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
          <Textarea
            placeholder="Write a message for everyone in this workspace…"
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
          <Button
            type="submit"
            size="sm"
            disabled={isSending || !message.trim()}
            className="rounded-xl gap-1.5 font-semibold w-full"
          >
            <Send className="size-3.5" />
            {isSending ? "Sending…" : "Send to everyone"}
          </Button>
        </form>
      )}

      <div className="flex-1 overflow-auto max-h-[320px] pr-1">
        {broadcasts === null ? (
          <p className="text-sm italic text-muted-foreground/60 py-6 text-center">Loading…</p>
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
                  <span className="text-[11px] text-muted-foreground shrink-0">
                    {new Date(b.createdAt).toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                    })}
                  </span>
                </div>
                <p className="text-sm text-muted-foreground mt-0.5 whitespace-pre-wrap break-words">
                  {b.body}
                </p>
                <span className="text-[11px] text-muted-foreground/70">
                  {b.metadata?.senderName ? `— ${b.metadata.senderName}` : ""}
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
    </div>
  );
}
