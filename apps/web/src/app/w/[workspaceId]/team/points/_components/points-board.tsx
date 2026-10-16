"use client";

import { useCallback, useEffect, useState } from "react";
import { format } from "date-fns";
import { Award, Loader2, Trophy } from "lucide-react";
import { apiClient } from "@tusker/api-client";
import type { PointsLedgerEntry, PointsSummary } from "@tusker/api-client/points";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const PERIOD_LABEL: Record<string, string> = {
    WEEKLY: "This week",
    MONTHLY: "This month",
    QUARTERLY: "This quarter",
    YEARLY: "This year",
    NEVER: "All time",
};

const signed = (n: number) => (n > 0 ? `+${n}` : `${n}`);
const tone = (n: number) => (n > 0 ? "text-success" : n < 0 ? "text-destructive" : "text-muted-foreground");

export function PointsBoard({ workspaceId }: { workspaceId: string }) {
    const [summary, setSummary] = useState<PointsSummary | null>(null);
    const [entries, setEntries] = useState<PointsLedgerEntry[] | null>(null);
    const [cursor, setCursor] = useState<string | null>(null);
    const [memberId, setMemberId] = useState<string | undefined>();
    const [loadingMore, setLoadingMore] = useState(false);

    const loadSummary = useCallback(() => {
        apiClient.points.getSummary(workspaceId).then(setSummary).catch((e) => toast.error(e.message));
    }, [workspaceId]);

    const loadEntries = useCallback(
        async (next?: string) => {
            try {
                const res = await apiClient.points.getEntries(workspaceId, { memberId, cursor: next, limit: 30 });
                setEntries((prev) => (next ? [...(prev ?? []), ...res.entries] : res.entries));
                setCursor(res.nextCursor);
            } catch (e: any) {
                toast.error(e.message);
                setEntries((prev) => prev ?? []);
            }
        },
        [workspaceId, memberId],
    );

    useEffect(loadSummary, [loadSummary]);
    useEffect(() => {
        setEntries(null);
        loadEntries();
    }, [loadEntries]);

    const refresh = () => {
        loadSummary();
        loadEntries();
    };

    if (!summary) {
        return (
            <div className="flex h-64 items-center justify-center">
                <Loader2 className="size-6 animate-spin text-muted-foreground" />
            </div>
        );
    }

    const selected = summary.members.find((m) => m.memberId === memberId);
    const awardable = summary.members.filter((m) => m.memberId !== summary.selfMemberId);

    return (
        <div className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                    <h2 className="font-heading text-lg font-bold">{PERIOD_LABEL[summary.period] ?? "This month"}</h2>
                    <p className="text-sm text-muted-foreground">
                        {summary.since ? `Since ${format(new Date(summary.since), "d MMM yyyy")} · ` : ""}
                        +1 per working day early, −1 per working day late
                    </p>
                </div>
                {summary.canAward && awardable.length > 0 && (
                    <AwardDialog workspaceId={workspaceId} members={awardable} onDone={refresh} />
                )}
            </div>

            <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
                {/* Leaderboard */}
                <section className="rounded-2xl bg-white/60 p-4 dark:bg-card/60">
                    <h3 className="mb-3 flex items-center gap-2 text-sm font-bold uppercase tracking-wide">
                        <Trophy className="size-4" /> Leaderboard
                    </h3>
                    {summary.members.length === 0 ? (
                        <p className="py-8 text-center text-sm text-muted-foreground">No one to show yet.</p>
                    ) : (
                        <ul className="flex flex-col gap-1.5">
                            {summary.members.map((m, i) => (
                                <li key={m.memberId}>
                                    <button
                                        type="button"
                                        onClick={() => setMemberId(memberId === m.memberId ? undefined : m.memberId)}
                                        aria-pressed={memberId === m.memberId}
                                        className={cn(
                                            "flex w-full items-center gap-3 rounded-full border px-3 py-2 text-left transition-colors",
                                            memberId === m.memberId ? "border-primary bg-primary/10" : "border-border bg-muted/30 hover:bg-muted/60",
                                        )}
                                    >
                                        <span className="w-5 text-center text-xs font-semibold text-muted-foreground">{i + 1}</span>
                                        <Avatar className="size-8">
                                            <AvatarImage src={m.image || ""} alt="" />
                                            <AvatarFallback>{m.name.charAt(0).toUpperCase()}</AvatarFallback>
                                        </Avatar>
                                        <span className="min-w-0 flex-1">
                                            <span className="block truncate text-sm font-medium">
                                                {m.name}
                                                {m.memberId === summary.selfMemberId && <span className="text-muted-foreground"> (you)</span>}
                                            </span>
                                            {m.designation && <span className="block truncate text-xs text-muted-foreground">{m.designation}</span>}
                                        </span>
                                        <span className={cn("font-heading text-base font-bold tabular-nums", tone(m.points))}>{signed(m.points)}</span>
                                    </button>
                                </li>
                            ))}
                        </ul>
                    )}
                </section>

                {/* Ledger */}
                <section className="rounded-2xl bg-white/60 p-4 dark:bg-card/60">
                    <div className="mb-3 flex items-center justify-between gap-2">
                        <h3 className="text-sm font-bold uppercase tracking-wide">
                            History{selected ? ` · ${selected.name}` : ""}
                        </h3>
                        {selected && (
                            <Button variant="ghost" size="sm" onClick={() => setMemberId(undefined)}>
                                Show everyone
                            </Button>
                        )}
                    </div>

                    {entries === null ? (
                        <div className="flex h-32 items-center justify-center">
                            <Loader2 className="size-5 animate-spin text-muted-foreground" />
                        </div>
                    ) : entries.length === 0 ? (
                        <p className="py-8 text-center text-sm text-muted-foreground">No points yet this period.</p>
                    ) : (
                        <ul className="flex flex-col gap-1.5">
                            {entries.map((e) => (
                                <li key={e.id} className="flex items-start gap-3 rounded-2xl border border-border bg-muted/30 px-4 py-2.5">
                                    <span className={cn("w-10 shrink-0 font-heading text-base font-bold tabular-nums", tone(e.points))}>
                                        {signed(e.points)}
                                    </span>
                                    <span className="min-w-0 flex-1">
                                        <span className={cn("block text-sm", e.reversedAt && "text-muted-foreground line-through")}>
                                            {e.reason}
                                        </span>
                                        <span className="block text-xs text-muted-foreground">
                                            {!selected && `${e.memberName} · `}
                                            {format(new Date(e.occurredAt), "d MMM, h:mm a")}
                                            {e.kind === "MANUAL" && e.awardedByName && ` · by ${e.awardedByName}`}
                                            {e.reversedAt && " · reversed"}
                                        </span>
                                    </span>
                                </li>
                            ))}
                        </ul>
                    )}

                    {cursor && (
                        <Button
                            variant="ghost"
                            className="mt-2 w-full"
                            disabled={loadingMore}
                            onClick={async () => {
                                setLoadingMore(true);
                                await loadEntries(cursor);
                                setLoadingMore(false);
                            }}
                        >
                            {loadingMore && <Loader2 className="size-4 animate-spin" />}
                            Load more
                        </Button>
                    )}
                </section>
            </div>
        </div>
    );
}

function AwardDialog({
    workspaceId,
    members,
    onDone,
}: {
    workspaceId: string;
    members: PointsSummary["members"];
    onDone: () => void;
}) {
    const [open, setOpen] = useState(false);
    const [memberId, setMemberId] = useState("");
    const [direction, setDirection] = useState<"award" | "deduct">("award");
    const [amount, setAmount] = useState("1");
    const [reason, setReason] = useState("");
    const [saving, setSaving] = useState(false);

    const value = Number(amount);
    const valid = memberId && Number.isInteger(value) && value >= 1 && value <= 1000 && reason.trim().length >= 3;

    const submit = async () => {
        if (!valid) return;
        setSaving(true);
        try {
            await apiClient.points.award(workspaceId, {
                memberId,
                points: direction === "award" ? value : -value,
                reason: reason.trim(),
            });
            toast.success(direction === "award" ? "Points awarded" : "Points deducted");
            setOpen(false);
            setMemberId("");
            setAmount("1");
            setReason("");
            onDone();
        } catch (e: any) {
            toast.error(e.message);
        } finally {
            setSaving(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <Button className="uppercase tracking-wide">
                    <Award className="size-4" />
                    Award points
                </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>Award or deduct points</DialogTitle>
                    <DialogDescription>The person is notified with your reason.</DialogDescription>
                </DialogHeader>

                <div className="flex flex-col gap-4">
                    <div className="flex flex-col gap-2">
                        <Label htmlFor="points-member">Member</Label>
                        <Select value={memberId} onValueChange={setMemberId}>
                            <SelectTrigger id="points-member" className="w-full">
                                <SelectValue placeholder="Choose a member" />
                            </SelectTrigger>
                            <SelectContent>
                                {members.map((m) => (
                                    <SelectItem key={m.memberId} value={m.memberId}>
                                        {m.name}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="flex gap-3">
                        <div className="flex flex-1 flex-col gap-2">
                            <Label htmlFor="points-direction">Action</Label>
                            <Select value={direction} onValueChange={(v) => setDirection(v as "award" | "deduct")}>
                                <SelectTrigger id="points-direction" className="w-full">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="award">Award</SelectItem>
                                    <SelectItem value="deduct">Deduct</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="flex w-28 flex-col gap-2">
                            <Label htmlFor="points-amount">Points</Label>
                            <Input
                                id="points-amount"
                                type="number"
                                min={1}
                                max={1000}
                                step={1}
                                value={amount}
                                onChange={(e) => setAmount(e.target.value)}
                            />
                        </div>
                    </div>

                    <div className="flex flex-col gap-2">
                        <Label htmlFor="points-reason">Reason</Label>
                        <Textarea
                            id="points-reason"
                            value={reason}
                            onChange={(e) => setReason(e.target.value)}
                            maxLength={500}
                            placeholder="e.g. Handled the client walkthrough on a Sunday"
                        />
                    </div>
                </div>

                <DialogFooter>
                    <Button variant="ghost" onClick={() => setOpen(false)}>
                        Cancel
                    </Button>
                    <Button onClick={submit} disabled={!valid || saving}>
                        {saving && <Loader2 className="size-4 animate-spin" />}
                        {direction === "award" ? "Award" : "Deduct"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
