"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { cn, formatIST } from "@/lib/utils";
import { formatDateOnly } from "@tusker/core/lib/date-utils";
import type { WorkspaceMemberRow } from "@tusker/core/types/workspace";
import { useWorkspaceLayout } from "../../_components/workspace-layout-context";
import { useSubTaskSheet } from "@/contexts/subtask-sheet-context";

/** The slice of a task row the member dialog renders. */
type MemberTask = {
    id: string;
    name: string;
    taskSlug?: string | null;
    status?: string | null;
    dueDate?: string | null;
    projectId?: string | null;
};

/**
 * The only statuses ever fetched for a member. Completed and cancelled work is
 * not a workload, and HOLD is not something the team page asks about.
 */
const OPEN_STATUSES = "TO_DO,IN_PROGRESS,REVIEW";

const TASK_STATUS_TABS = [
    { value: "ALL", label: "All" },
    { value: "TO_DO", label: "To Do" },
    { value: "IN_PROGRESS", label: "In Progress" },
    { value: "REVIEW", label: "In Review" },
] as const;

/** One page of the member's task list. Small on purpose - it grows on scroll. */
const TASK_PAGE_SIZE = 10;

const TASK_STATUS_COLORS: Record<string, string> = {
    TO_DO: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200",
    IN_PROGRESS: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
    REVIEW: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300",
    HOLD: "bg-rose-100 text-rose-800 dark:bg-rose-900/30 dark:text-rose-300",
    COMPLETED: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300",
    CANCELLED: "bg-muted text-muted-foreground",
};

export interface ViewMemberDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    workspaceId: string;
    member: WorkspaceMemberRow | null;
}

export function ViewMemberDialog({
    open,
    onOpenChange,
    workspaceId,
    member,
}: ViewMemberDialogProps) {
    const { data: layoutData } = useWorkspaceLayout();
    const { openSubTaskSheet } = useSubTaskSheet();

    // Open tasks assigned to the member being viewed. null = first page loading.
    const [memberTasks, setMemberTasks] = useState<MemberTask[] | null>(null);
    const [taskStatus, setTaskStatus] = useState<string>("ALL");
    const [taskCursor, setTaskCursor] = useState<any>(null);
    const [hasMoreTasks, setHasMoreTasks] = useState(false);
    const [isLoadingMoreTasks, setIsLoadingMoreTasks] = useState(false);

    /**
     * Hand the task to the shared right-side panel, where its status can be
     * changed. The member dialog closes first: it is a modal, so it would sit
     * on top of the sheet and swallow every click meant for it.
     */
    const handleOpenTask = useCallback(
        (task: MemberTask) => {
            onOpenChange(false);
            openSubTaskSheet({ id: task.id, taskSlug: task.taskSlug, projectId: task.projectId });
        },
        [onOpenChange, openSubTaskSheet],
    );

    /**
     * One page of the member's tasks. The list route accepts a userId in `a`
     * (buildAssigneeFilter matches either the project-member id or the user id)
     * and, because a filter is present, drops the root-only constraint - so this
     * returns their parent tasks and subtasks alike, not just the roots.
     */
    const loadMemberTasks = useCallback(
        async (cursor: any) => {
            const userId = member?.userId;
            if (!userId) return;

            const params = new URLSearchParams({
                w: workspaceId,
                vm: "list",
                a: userId,
                l: String(TASK_PAGE_SIZE),
                s: taskStatus === "ALL" ? OPEN_STATUSES : taskStatus,
            });
            if (cursor) params.set("c", JSON.stringify(cursor));

            try {
                const res = await fetch(`/api/v1/tasks?${params.toString()}`);
                const json = await res.json();
                const raw: MemberTask[] = json?.success ? json.data?.tasks ?? [] : [];

                const allowed = taskStatus === "ALL" ? OPEN_STATUSES.split(",") : [taskStatus];
                const page = raw.filter((t) => !!t.status && allowed.includes(t.status));

                setMemberTasks((prev) => (cursor && prev ? [...prev, ...page] : page));
                setHasMoreTasks(!!json?.data?.hasMore);
                setTaskCursor(json?.data?.nextCursor ?? null);
            } catch {
                setMemberTasks((prev) => prev ?? []);
                setHasMoreTasks(false);
            }
        },
        [member?.userId, workspaceId, taskStatus],
    );

    // First page: on open, and again whenever the member or status tab changes.
    useEffect(() => {
        if (!open || !member?.userId) return;
        setMemberTasks(null);
        setTaskCursor(null);
        setHasMoreTasks(false);
        loadMemberTasks(null);
    }, [open, member?.userId, taskStatus, loadMemberTasks]);

    /** Pull the next page once the scroller is within a row of the bottom. */
    const handleTaskScroll = useCallback(
        async (e: React.UIEvent<HTMLDivElement>) => {
            if (!hasMoreTasks || isLoadingMoreTasks) return;
            const el = e.currentTarget;
            if (el.scrollTop + el.clientHeight < el.scrollHeight - 60) return;

            setIsLoadingMoreTasks(true);
            await loadMemberTasks(taskCursor);
            setIsLoadingMoreTasks(false);
        },
        [hasMoreTasks, isLoadingMoreTasks, taskCursor, loadMemberTasks],
    );

    // The tab resets with the dialog so the next member opens on "All".
    useEffect(() => {
        if (!open) setTaskStatus("ALL");
    }, [open]);

    if (!member) return null;

    const projectNames = new Map<string, string>(
        (layoutData?.projects ?? []).map((p: any) => [p.id, p.name])
    );

    // Grouped over what has loaded so far, so a page that
    // scrolls in lands under its own project rather than at
    // the bottom of the list.
    const groups = new Map<string, MemberTask[]>();
    (memberTasks ?? []).forEach((t) => {
        const key = t.projectId || "none";
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key)!.push(t);
    });
    const taskGroups = [...groups.entries()];
    const initials = (member.name?.[0] || member.surname?.[0])?.toUpperCase() || "?";
    const isVerified = member.status === "Verified";
    const role = member.workspaceRole.toLowerCase().replace(/_/g, " ");

    /** One labelled cell of the detail grid. */
    const Field = ({ label, value }: { label: string; value: React.ReactNode }) => (
        <div className="p-4 rounded-2xl bg-muted/30 border border-muted-foreground/5 space-y-1">
            <p className="text-[10px] font-medium uppercase text-muted-foreground tracking-widest">{label}</p>
            <p className="font-medium">{value || "-"}</p>
        </div>
    );

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-3xl max-h-[88vh] overflow-y-auto rounded-3xl border-none shadow-2xl p-0">
                <div className="p-8 space-y-6">
                    <DialogHeader className="flex flex-row items-start justify-between gap-4 w-full pr-4">
                        <div className="flex items-center gap-4">
                            <Avatar className="size-16 border-2 border-primary/20">
                                <AvatarFallback className="text-xl font-medium">{initials}</AvatarFallback>
                            </Avatar>
                            <div className="text-left">
                                <DialogTitle className="text-2xl font-medium">
                                    {member.name || member.surname}
                                </DialogTitle>
                                <p className="text-sm text-muted-foreground font-medium">{member.email}</p>
                                {member.designation && (
                                    <p className="text-xs text-muted-foreground/80">{member.designation}</p>
                                )}
                            </div>
                        </div>

                        <span className={cn(
                            "inline-flex shrink-0 items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
                            isVerified ? "bg-green-500/10 text-green-500" : "bg-amber-500/10 text-amber-500"
                        )}>
                            {member.status}
                        </span>
                    </DialogHeader>

                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                        <Field
                            label="Role"
                            value={
                                <span className="flex items-center gap-2 capitalize">
                                    <span className="size-2 rounded-full bg-primary" />
                                    {role}
                                </span>
                            }
                        />
                        <Field label="Nickname" value={member.surname} />
                        <Field label="Department" value={member.departmentName} />
                        <Field
                            label="Employee ID"
                            value={member.employeeId ? <span className="font-mono text-xs">{member.employeeId}</span> : null}
                        />
                        <Field label="Phone" value={member.phoneNumber} />
                        <Field
                            label="Date of Birth"
                            value={member.dateOfBirth ? formatDateOnly(member.dateOfBirth, "d MMM yyyy") : null}
                        />
                        <Field label="Reports To" value={member.reportToName} />
                    </div>

                    {(member.casualLeaveBalance !== undefined || member.sickLeaveBalance !== undefined) && (
                        <div className="space-y-2">
                            <p className="text-[10px] font-medium uppercase text-muted-foreground tracking-widest">
                                Leave Balance
                            </p>
                            <div className="grid grid-cols-2 gap-4">
                                <div className="p-4 rounded-2xl bg-muted/30 border border-muted-foreground/5 space-y-1">
                                    <p className="text-[10px] font-medium uppercase text-muted-foreground tracking-widest flex items-center gap-2">
                                        <span className="size-2 rounded-full bg-blue-500" />
                                        Casual
                                    </p>
                                    <p className="font-medium">{member.casualLeaveBalance ?? 0} days</p>
                                </div>
                                <div className="p-4 rounded-2xl bg-muted/30 border border-muted-foreground/5 space-y-1">
                                    <p className="text-[10px] font-medium uppercase text-muted-foreground tracking-widest flex items-center gap-2">
                                        <span className="size-2 rounded-full bg-rose-500" />
                                        Sick
                                    </p>
                                    <p className="font-medium">{member.sickLeaveBalance ?? 0} days</p>
                                </div>
                            </div>
                        </div>
                    )}

                    <div className="space-y-3">
                        <div className="flex items-baseline justify-between">
                            <p className="text-[10px] font-medium uppercase text-muted-foreground tracking-widest">
                                Assigned Tasks
                            </p>
                            {memberTasks && (
                                <span className="text-xs text-muted-foreground">
                                    {memberTasks.length}{hasMoreTasks ? "+" : ""} shown
                                </span>
                            )}
                        </div>

                        <div className="flex items-center p-1 rounded-xl bg-muted border text-xs w-fit">
                            {TASK_STATUS_TABS.map((tab) => (
                                <button
                                    key={tab.value}
                                    type="button"
                                    onClick={() => setTaskStatus(tab.value)}
                                    className={cn(
                                        "px-3 py-1 rounded-lg font-medium transition-colors",
                                        taskStatus === tab.value
                                            ? "bg-background shadow text-foreground"
                                            : "text-muted-foreground hover:text-foreground"
                                    )}
                                >
                                    {tab.label}
                                </button>
                            ))}
                        </div>

                        {memberTasks === null ? (
                            <div className="space-y-2">
                                {[...Array(3)].map((_, i) => (
                                    <div key={i} className="h-14 rounded-2xl bg-muted/40 animate-pulse" />
                                ))}
                            </div>
                        ) : memberTasks.length === 0 ? (
                            <div className="p-8 text-center text-sm text-muted-foreground border border-dashed rounded-2xl">
                                No tasks in this status
                            </div>
                        ) : (
                            <div
                                onScroll={handleTaskScroll}
                                className="max-h-64 overflow-y-auto space-y-4 pr-1"
                            >
                                {taskGroups.map(([projId, tasks]) => (
                                    <div key={projId} className="space-y-1.5">
                                        <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground px-1">
                                            {projectNames.get(projId) || "No project"}
                                        </p>
                                        {tasks.map((task) => (
                                            <button
                                                key={task.id}
                                                type="button"
                                                onClick={() => handleOpenTask(task)}
                                                className="w-full text-left p-3 rounded-2xl bg-muted/30 hover:bg-muted/60 transition-colors flex items-center justify-between gap-3 group"
                                            >
                                                <div className="min-w-0 flex-1">
                                                    <p className="text-sm font-medium truncate group-hover:text-primary transition-colors">
                                                        {task.name}
                                                    </p>
                                                    {task.taskSlug && (
                                                        <p className="text-[11px] font-mono text-muted-foreground">
                                                            {task.taskSlug}
                                                        </p>
                                                    )}
                                                </div>
                                                <div className="flex items-center gap-2 shrink-0">
                                                    {task.status && (
                                                        <span
                                                            className={cn(
                                                                "text-[10px] px-2 py-0.5 rounded-full font-medium",
                                                                TASK_STATUS_COLORS[task.status] || "bg-muted text-muted-foreground"
                                                            )}
                                                        >
                                                            {task.status.replace(/_/g, " ")}
                                                        </span>
                                                    )}
                                                    {task.dueDate && (
                                                        <span className="text-[11px] text-muted-foreground">
                                                            Due {formatIST(task.dueDate, "d MMM yyyy")}
                                                        </span>
                                                    )}
                                                    <span className="text-[11px] text-muted-foreground/70 truncate">
                                                        {projectNames.get(task.projectId || "") || "No project"}
                                                    </span>
                                                </div>
                                            </button>
                                        ))}
                                    </div>
                                ))}

                                {isLoadingMoreTasks && (
                                    <div className="h-12 rounded-2xl bg-muted/40 animate-pulse" />
                                )}
                            </div>
                        )}
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}
