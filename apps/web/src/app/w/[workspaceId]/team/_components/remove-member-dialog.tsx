"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, ChevronLeft, Loader2, UserMinus } from "lucide-react";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { toast } from "@/lib/toast";
import { apiClient } from "@tusker/api-client";
import type {
    MemberPendingWork,
    PendingWorkTask,
} from "@tusker/api-client/workspaces";
import { useWorkspaceMemberStore } from "@/lib/store/workspace-member-store";
import type { WorkspaceMemberRow } from "@tusker/core/types/workspace";

type JoinRole = "MEMBER" | "LEAD" | "PROJECT_COORDINATOR";

const JOIN_ROLES: { value: JoinRole; label: string }[] = [
    { value: "MEMBER", label: "Member" },
    { value: "LEAD", label: "Lead" },
    { value: "PROJECT_COORDINATOR", label: "Project coordinator" },
];

interface StagedBatch {
    toUserId: string;
    toName: string;
    taskIds: string[];
    /** Projects the destination is not in yet. */
    missingProjects: { id: string; name: string }[];
    /** Tasks where the leaver is both assignee and reviewer. */
    collisions: string[];
}

interface Props {
    workspaceId: string;
    member: WorkspaceMemberRow;
    onClose: () => void;
    onDone: () => void;
}

export function RemoveMemberDialog({
    workspaceId,
    member,
    onClose,
    onDone,
}: Props) {
    const [work, setWork] = useState<MemberPendingWork | null>(null);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [ticked, setTicked] = useState<Set<string>>(new Set());
    const [dest, setDest] = useState<Map<string, string>>(new Map());
    const [vacated, setVacated] = useState<Set<string>>(new Set());
    const [roles, setRoles] = useState<Map<string, JoinRole>>(new Map());
    const [picked, setPicked] = useState<string>("");
    const [step, setStep] = useState<"list" | "projectWarn" | "selfReviewWarn">("list");
    const [staged, setStaged] = useState<StagedBatch | null>(null);
    const [busy, setBusy] = useState(false);

    const { slimMembersByWorkspace, fetchSlimMembers } = useWorkspaceMemberStore();
    const slim = slimMembersByWorkspace[workspaceId];

    useEffect(() => {
        const needsFetch = !slim || slim.length === 0 || !slim.some((m: any) => m.userId);
        fetchSlimMembers(workspaceId, needsFetch);
    }, [workspaceId, fetchSlimMembers, slim]);

    useEffect(() => {
        let cancelled = false;
        apiClient.workspaces
            .getMemberPendingWork(workspaceId, member.id)
            .then((data) => {
                if (!cancelled) setWork(data);
            })
            .catch((e: any) => {
                if (!cancelled) setLoadError(e?.message || "Could not load their tasks");
            });
        return () => {
            cancelled = true;
        };
    }, [workspaceId, member.id]);

    /** Everyone the work could go to — active members, minus the person leaving. */
    const candidates = useMemo(
        () =>
            (slim ?? [])
                .filter((m: any) => m.userId && m.userId !== member.userId)
                .map((m: any) => {
                    const rawName = (m.name || m.user?.name || "").trim();
                    const rawSurname = (m.surname || m.user?.surname || "").trim();
                    let displayName = "";
                    if (rawName && rawSurname && rawName !== rawSurname && rawSurname !== "Member") {
                        displayName = `${rawName} ${rawSurname}`;
                    } else {
                        displayName = rawName || (rawSurname !== "Member" ? rawSurname : "") || m.email || "Unknown";
                    }
                    return {
                        userId: m.userId as string,
                        name: displayName,
                    };
                }),
        [slim, member.userId],
    );

    const tasks = work?.tasks ?? [];
    const resolvedCount = dest.size;
    const allResolved = tasks.length > 0 && resolvedCount === tasks.length;
    const nameOf = (userId: string) =>
        candidates.find((c) => c.userId === userId)?.name ?? "Unknown";

    const toggle = (taskId: string) =>
        setTicked((prev) => {
            const next = new Set(prev);
            next.has(taskId) ? next.delete(taskId) : next.add(taskId);
            return next;
        });

    const selectAllState: boolean | "indeterminate" =
        ticked.size === 0 ? false : ticked.size === tasks.length ? true : "indeterminate";

    /** Write a staged batch into `dest` and clear the working selection. */
    const commitBatch = (batch: StagedBatch, vacateCollisions: boolean) => {
        setDest((prev) => {
            const next = new Map(prev);
            for (const id of batch.taskIds) next.set(id, batch.toUserId);
            return next;
        });
        if (vacateCollisions && batch.collisions.length) {
            setVacated((prev) => new Set([...prev, ...batch.collisions]));
        }
        // The destination is in these projects from here on, so a later batch to
        // the same person doesn't warn about them again.
        if (batch.missingProjects.length && work) {
            setWork({
                ...work,
                projectMemberUserIds: {
                    ...work.projectMemberUserIds,
                    ...Object.fromEntries(
                        batch.missingProjects.map((p) => [
                            p.id,
                            [...(work.projectMemberUserIds[p.id] ?? []), batch.toUserId],
                        ]),
                    ),
                },
            });
        }
        setTicked(new Set());
        setPicked("");
        setStaged(null);
        setStep("list");
    };

    const onAssign = () => {
        if (!work || !picked || ticked.size === 0) return;
        const taskIds = [...ticked];
        const chosen = tasks.filter((t) => ticked.has(t.id));

        const missingProjects = [
            ...new Map(
                chosen
                    .filter(
                        (t) => !(work.projectMemberUserIds[t.projectId] ?? []).includes(picked),
                    )
                    .map((t) => [t.projectId, { id: t.projectId, name: t.projectName }]),
            ).values(),
        ];
        const collisions = chosen.filter((t) => t.roles.length === 2).map((t) => t.id);

        const batch: StagedBatch = {
            toUserId: picked,
            toName: nameOf(picked),
            taskIds,
            missingProjects,
            collisions,
        };

        if (missingProjects.length) {
            setRoles((prev) => {
                const next = new Map(prev);
                for (const p of missingProjects) if (!next.has(p.id)) next.set(p.id, "MEMBER");
                return next;
            });
            setStaged(batch);
            setStep("projectWarn");
            return;
        }
        if (collisions.length) {
            setStaged(batch);
            setStep("selfReviewWarn");
            return;
        }
        commitBatch(batch, false);
    };

    const onRemove = async () => {
        if (!work || !allResolved) return;
        setBusy(true);

        // dest is taskId -> userId; the API wants one entry per destination.
        const grouped = new Map<string, string[]>();
        for (const [taskId, userId] of dest) {
            if (!grouped.has(userId)) grouped.set(userId, []);
            grouped.get(userId)!.push(taskId);
        }

        try {
            const res = await apiClient.workspaces.deactivateMember(workspaceId, member.id, {
                assignments: [...grouped].map(([toUserId, taskIds]) => ({ toUserId, taskIds })),
                projectRoles: Object.fromEntries(roles),
                vacatedAssigneeTaskIds: [...vacated],
            });
            if (res.status === "success") {
                toast.success(res.message);
                onDone();
            } else {
                toast.error(res.message);
            }
        } catch (e: any) {
            toast.error(e?.message || "Could not remove this member");
        } finally {
            setBusy(false);
        }
    };

    const memberName = work?.memberName || member.surname || member.name || "this member";

    return (
        <Dialog open onOpenChange={(o) => !o && onClose()}>
            <DialogContent className="sm:max-w-3xl max-h-[85vh] flex flex-col">
                <DialogHeader className="pr-10">
                    <DialogTitle className="flex items-center gap-2">
                        <UserMinus className="size-5 text-destructive" />
                        Remove {memberName}
                    </DialogTitle>
                    <DialogDescription>
                        {step === "list"
                            ? "Their pending work has to go to someone else first. Tick a set of tasks, choose who takes them, and repeat until everything has a destination."
                            : step === "projectWarn"
                                ? "That person is not in every project yet."
                                : "That would make someone review their own work."}
                    </DialogDescription>
                </DialogHeader>

                {/* ---------- loading / error ---------- */}
                {!work && !loadError && (
                    <div className="flex items-center justify-center py-16 text-muted-foreground">
                        <Loader2 className="mr-2 size-4 animate-spin" />
                        Loading their tasks…
                    </div>
                )}
                {loadError && (
                    <div className="py-10 text-center text-sm text-destructive">{loadError}</div>
                )}

                {/* ---------- nothing to hand over ---------- */}
                {work && tasks.length === 0 && (
                    <div className="py-10 text-center space-y-1">
                        <p className="text-sm font-medium">No pending tasks to transfer</p>
                        <p className="text-xs text-muted-foreground">
                            {memberName} holds no outstanding work, so they can be removed straight away.
                        </p>
                    </div>
                )}

                {/* ---------- the task list ---------- */}
                {work && tasks.length > 0 && step === "list" && (
                    <>
                        <div className="flex items-center justify-between gap-3 border-y py-2 shrink-0">
                            <label className="flex items-center gap-2 text-sm cursor-pointer">
                                <Checkbox
                                    checked={selectAllState}
                                    onCheckedChange={(v) =>
                                        setTicked(v === true ? new Set(tasks.map((t) => t.id)) : new Set())
                                    }
                                />
                                <span>
                                    {ticked.size > 0 ? `${ticked.size} selected` : "Select all"}
                                </span>
                            </label>

                            <div className="flex items-center gap-2">
                                <Select value={picked} onValueChange={setPicked}>
                                    <SelectTrigger className="h-9 w-56">
                                        <SelectValue placeholder="Transfer to…" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {candidates.length === 0 ? (
                                            <div className="py-2 px-3 text-xs text-muted-foreground text-center">
                                                {!slim ? "Loading members…" : "No other members available"}
                                            </div>
                                        ) : (
                                            candidates.map((c) => (
                                                <SelectItem key={c.userId} value={c.userId}>
                                                    {c.name}
                                                </SelectItem>
                                            ))
                                        )}
                                    </SelectContent>
                                </Select>
                                <Button size="sm" disabled={!picked || ticked.size === 0} onClick={onAssign}>
                                    Assign
                                </Button>
                            </div>
                        </div>

                        <div className="flex-1 overflow-y-auto -mx-1 px-1">
                            {tasks.map((t) => (
                                <TaskRow
                                    key={t.id}
                                    task={t}
                                    checked={ticked.has(t.id)}
                                    onToggle={() => toggle(t.id)}
                                    destName={dest.has(t.id) ? nameOf(dest.get(t.id)!) : null}
                                    vacated={vacated.has(t.id)}
                                />
                            ))}
                        </div>

                        <div className="flex items-center justify-between gap-4 border-t pt-3 shrink-0">
                            <p className="text-xs text-muted-foreground">
                                {resolvedCount} of {tasks.length} assigned
                                {vacated.size > 0 && ` · ${vacated.size} will be left unassigned`}
                            </p>
                            <div className="flex items-center gap-2">
                                <Button variant="outline" onClick={onClose} disabled={busy}>
                                    Cancel
                                </Button>
                                <Button
                                    variant="destructive"
                                    disabled={!allResolved || busy}
                                    onClick={onRemove}
                                    title={
                                        allResolved
                                            ? undefined
                                            : `${tasks.length - resolvedCount} task(s) still need a destination`
                                    }
                                >
                                    {busy && <Loader2 className="mr-2 size-4 animate-spin" />}
                                    Remove {memberName}
                                </Button>
                            </div>
                        </div>
                    </>
                )}

                {/* ---------- no pending work: straight to remove ---------- */}
                {work && tasks.length === 0 && (
                    <div className="flex items-center justify-end gap-2 border-t pt-3">
                        <Button variant="outline" onClick={onClose} disabled={busy}>
                            Cancel
                        </Button>
                        <Button variant="destructive" disabled={busy} onClick={onRemove}>
                            {busy && <Loader2 className="mr-2 size-4 animate-spin" />}
                            Remove {memberName}
                        </Button>
                    </div>
                )}

                {/* ---------- warning: destination is not in these projects ---------- */}
                {step === "projectWarn" && staged && (
                    <>
                        <div className="flex-1 overflow-y-auto space-y-4">
                            <div className="flex gap-3 rounded-lg border border-amber-500/40 bg-amber-500/5 p-3">
                                <AlertTriangle className="size-5 shrink-0 text-amber-600" />
                                <p className="text-sm">
                                    <span className="font-medium">{staged.toName}</span> is not a member of{" "}
                                    {staged.missingProjects.length === 1 ? "this project" : "these projects"} yet.
                                    Choose the role they should join with, or go back and pick someone else.
                                </p>
                            </div>
                            {staged.missingProjects.map((p) => (
                                <div key={p.id} className="flex items-center justify-between gap-3">
                                    <span className="text-sm font-medium">{p.name}</span>
                                    <Select
                                        value={roles.get(p.id) ?? "MEMBER"}
                                        onValueChange={(v) =>
                                            setRoles((prev) => new Map(prev).set(p.id, v as JoinRole))
                                        }
                                    >
                                        <SelectTrigger className="h-9 w-52">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {JOIN_ROLES.map((r) => (
                                                <SelectItem key={r.value} value={r.value}>
                                                    {r.label}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                            ))}
                        </div>
                        <div className="flex items-center justify-end gap-2 border-t pt-3">
                            <Button
                                variant="outline"
                                onClick={() => {
                                    setStaged(null);
                                    setStep("list");
                                }}
                            >
                                <ChevronLeft className="mr-1 size-4" />
                                Back
                            </Button>
                            <Button
                                onClick={() =>
                                    staged.collisions.length
                                        ? setStep("selfReviewWarn")
                                        : commitBatch(staged, false)
                                }
                            >
                                Add and continue
                            </Button>
                        </div>
                    </>
                )}

                {/* ---------- warning: same person would be assignee and reviewer ---------- */}
                {step === "selfReviewWarn" && staged && (
                    <>
                        <div className="flex-1 overflow-y-auto space-y-4">
                            <div className="flex gap-3 rounded-lg border border-amber-500/40 bg-amber-500/5 p-3">
                                <AlertTriangle className="size-5 shrink-0 text-amber-600" />
                                <p className="text-sm">
                                    {memberName} is both assignee <em>and</em> reviewer on{" "}
                                    <span className="font-medium">
                                        {staged.collisions.length}{" "}
                                        {staged.collisions.length === 1 ? "task" : "tasks"}
                                    </span>
                                    . Moving both roles would leave{" "}
                                    <span className="font-medium">{staged.toName}</span> reviewing their own
                                    work. Proceeding gives them the review and leaves the task unassigned for
                                    someone to pick up.
                                </p>
                            </div>
                            <div className="rounded-md border divide-y">
                                {tasks
                                    .filter((t) => staged.collisions.includes(t.id))
                                    .map((t) => (
                                        <div key={t.id} className="px-3 py-2 text-sm">
                                            <p className="font-medium">{t.name}</p>
                                            <p className="text-xs text-muted-foreground">{t.projectName}</p>
                                        </div>
                                    ))}
                            </div>
                        </div>
                        <div className="flex items-center justify-end gap-2 border-t pt-3">
                            <Button
                                variant="outline"
                                onClick={() => {
                                    setStaged(null);
                                    setStep("list");
                                }}
                            >
                                <ChevronLeft className="mr-1 size-4" />
                                Back
                            </Button>
                            <Button onClick={() => commitBatch(staged, true)}>Proceed anyway</Button>
                        </div>
                    </>
                )}
            </DialogContent>
        </Dialog>
    );
}

function TaskRow({
    task,
    checked,
    onToggle,
    destName,
    vacated,
}: {
    task: PendingWorkTask;
    checked: boolean;
    onToggle: () => void;
    destName: string | null;
    vacated: boolean;
}) {
    return (
        <label
            className={cn(
                "flex items-start gap-3 rounded-md px-2 py-2 cursor-pointer hover:bg-muted/50",
                destName && "bg-muted/30",
            )}
        >
            <Checkbox checked={checked} onCheckedChange={onToggle} className="mt-0.5" />
            <div className="min-w-0 flex-1">
                <p className="text-sm font-medium truncate">{task.name}</p>
                <div className="flex flex-wrap items-center gap-1.5 mt-0.5">
                    <span className="text-xs text-muted-foreground">{task.projectName}</span>
                    <Badge variant="outline" className="text-[10px] px-1 py-0">
                        {task.status?.replace("_", " ")}
                    </Badge>
                    {task.roles.map((r) => (
                        <Badge key={r} variant="secondary" className="text-[10px] px-1 py-0">
                            {r}
                        </Badge>
                    ))}
                </div>
            </div>
            {destName && (
                <Badge
                    variant={vacated ? "outline" : "default"}
                    className={cn("shrink-0 text-[10px]", vacated && "border-amber-500/60 text-amber-700")}
                >
                    {vacated ? `Reviewer → ${destName} · unassigned` : `→ ${destName}`}
                </Badge>
            )}
        </label>
    );
}
