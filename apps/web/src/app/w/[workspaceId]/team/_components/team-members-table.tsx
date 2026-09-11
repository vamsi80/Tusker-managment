"use client";

import React, { useState } from "react";
import { DataTable } from "@/components/data-table/data-table";
import { createTeamMemberColumns } from "./team-member-columns";
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
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
} from "@/components/ui/dialog";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { cn, formatIST } from "@/lib/utils";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Loader2 } from "lucide-react";
import { toast } from "@/lib/toast";
import { useRouter } from "next/navigation";
import { apiClient, type ApiResponse } from "@tusker/api-client";
import { type WorkspaceMemberRow } from "@tusker/core/types/workspace";
import { format } from "date-fns";
import { formatDateOnly } from "@tusker/core/lib/date-utils";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { updateMemberSchema, UpdateMemberSchemaType, workspaceMemberRole } from "@tusker/core/lib/zodSchemas";
import {
    Form,
    FormControl,
    FormDescription,
    FormField,
    FormItem,
    FormLabel,
    FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";


import { listDepartments } from "@/actions/department/department-actions";
import { useWorkspaceLayout } from "../../_components/workspace-layout-context";

// Radix Select cannot hold an empty string, so "no department" needs a sentinel.
const NO_DEPARTMENT = "__none__";

/** The slice of a task row the member dialog renders. */
type MemberTask = {
    id: string;
    name: string;
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
interface TeamMembersProps {
    data: WorkspaceMemberRow[];
    isAdmin: boolean;
    workspaceId: string;
    pagination?: {
        page: number;
        limit: number;
        totalCount: number;
        search?: string;
        onSearchChange?: (search: string) => void;
        onPageChange: (page: number) => void;
        onLimitChange: (limit: number) => void;
    };
    departmentFilter?: {
        options: { id: string; name: string }[];
        value: string[];
        onChange: (value: string[]) => void;
    };
}

export function TeamMembers({ data, isAdmin, workspaceId, pagination, departmentFilter }: TeamMembersProps) {
    const router = useRouter();


    // View member dialog state
    const [viewDialogOpen, setViewDialogOpen] = useState(false);
    const [memberToView, setMemberToView] = useState<WorkspaceMemberRow | null>(null);

    // Edit member state
    const [editDialogOpen, setEditDialogOpen] = useState(false);
    const [memberToEdit, setMemberToEdit] = useState<WorkspaceMemberRow | null>(null);

    // Delete member state
    const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
    const [memberToDelete, setMemberToDelete] = useState<WorkspaceMemberRow | null>(null);
    const [isDeleting, setIsDeleting] = useState(false);
    const [isUpdating, setIsUpdating] = useState(false);
    const [managers, setManagers] = useState<{ id: string; surname: string }[]>([]);
    const [departments, setDepartments] = useState<{ id: string; name: string }[]>([]);

    React.useEffect(() => {
        const fetchManagers = async () => {
            const result: ApiResponse = await apiClient.workspaces.getManagers(workspaceId);
            if (result.status === "success") {
                setManagers(result.data);
            }
        };
        if (editDialogOpen) {
            fetchManagers();
            listDepartments(workspaceId).then((res) => setDepartments(res.data));
        }
    }, [workspaceId, editDialogOpen]);

    const editForm = useForm<UpdateMemberSchemaType>({
        resolver: zodResolver(updateMemberSchema),
        defaultValues: {
            name: "",
            surname: "",
            email: "",
            phoneNumber: "",
            role: "MEMBER",
            designation: "",
            employeeId: "",
            dateOfBirth: "",
            reportToId: "",
            departmentId: "",
            workspaceId: workspaceId,
        },
    });

    // Open tasks assigned to the member being viewed. null = first page loading.
    const [memberTasks, setMemberTasks] = useState<MemberTask[] | null>(null);
    const [taskStatus, setTaskStatus] = useState<string>("ALL");
    const [taskCursor, setTaskCursor] = useState<any>(null);
    const [hasMoreTasks, setHasMoreTasks] = useState(false);
    const [isLoadingMoreTasks, setIsLoadingMoreTasks] = useState(false);
    const { data: layoutData } = useWorkspaceLayout();

    const handleViewMember = React.useCallback((member: WorkspaceMemberRow) => {
        setMemberToView(member);
        setViewDialogOpen(true);
    }, []);

    /**
     * One page of the member's tasks. The list route accepts a userId in `a`
     * (buildAssigneeFilter matches either the project-member id or the user id)
     * and, because a filter is present, drops the root-only constraint - so this
     * returns their parent tasks and subtasks alike, not just the roots.
     */
    const loadMemberTasks = React.useCallback(
        async (cursor: any) => {
            const userId = memberToView?.userId;
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

                // The status filter is an OR with "has a subtask in that status",
                // so a completed parent can ride in on an open child. Filter the
                // page to what was actually asked for.
                const allowed = taskStatus === "ALL" ? OPEN_STATUSES.split(",") : [taskStatus];
                const page = raw.filter((t) => !!t.status && allowed.includes(t.status));

                // A cursor means this is a scroll-triggered page, so append.
                setMemberTasks((prev) => (cursor && prev ? [...prev, ...page] : page));
                setHasMoreTasks(!!json?.data?.hasMore);
                setTaskCursor(json?.data?.nextCursor ?? null);
            } catch {
                setMemberTasks((prev) => prev ?? []);
                setHasMoreTasks(false);
            }
        },
        [memberToView?.userId, workspaceId, taskStatus],
    );

    // First page: on open, and again whenever the member or status tab changes.
    React.useEffect(() => {
        if (!viewDialogOpen || !memberToView?.userId) return;
        setMemberTasks(null);
        setTaskCursor(null);
        setHasMoreTasks(false);
        loadMemberTasks(null);
    }, [viewDialogOpen, memberToView?.userId, taskStatus, loadMemberTasks]);

    /** Pull the next page once the scroller is within a row of the bottom. */
    const handleTaskScroll = React.useCallback(
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
    React.useEffect(() => {
        if (!viewDialogOpen) setTaskStatus("ALL");
    }, [viewDialogOpen]);

    const handleEditMember = React.useCallback((member: WorkspaceMemberRow) => {
        setMemberToEdit(member);
        editForm.reset({
            name: member.name || "",
            surname: member.surname || "",
            email: member.email || "",
            phoneNumber: member.phoneNumber || "",
            role: member.workspaceRole as any,
            designation: member.designation || "",
            employeeId: member.employeeId || "",
            dateOfBirth: member.dateOfBirth ? (member.dateOfBirth instanceof Date ? member.dateOfBirth.toISOString().split('T')[0] : member.dateOfBirth.toString().split('T')[0]) : "",
            reportToId: member.reportToId || "",
            departmentId: member.departmentId || "",
            workspaceId: workspaceId,
        });
        setEditDialogOpen(true);
    }, [editForm, workspaceId]);

    const handleEditConfirm = async (values: UpdateMemberSchemaType) => {
        if (!memberToEdit) return;

        setIsUpdating(true);
        try {
            const result: ApiResponse = await apiClient.workspaces.updateMember(workspaceId, memberToEdit.id, values);

            if (result.status === "success") {
                toast.success(result.message);
                if ((result as any).emailChanged) {
                    toast.info("Email was changed. A new verification link has been sent.");
                }
                setEditDialogOpen(false);
                setMemberToEdit(null);
                router.refresh();
            } else {
                toast.error(result.message);
            }
        } catch (error: any) {
            toast.error(error.message || "Failed to update member");
        } finally {
            setIsUpdating(false);
        }
    };

    const handleDeleteMember = React.useCallback((member: WorkspaceMemberRow) => {
        setMemberToDelete(member);
        setDeleteDialogOpen(true);
    }, []);

    const handleDeleteConfirm = async () => {
        if (!memberToDelete) return;

        setIsDeleting(true);
        try {
            const result: ApiResponse = await apiClient.workspaces.removeMember(workspaceId, memberToDelete.id);

            if (result.status === "success") {
                toast.success(result.message);
                setDeleteDialogOpen(false);
                setMemberToDelete(null);
                router.refresh();
            } else {
                toast.error(result.message);
            }
        } catch (error) {
            toast.error("Failed to remove member");
        } finally {
            setIsDeleting(false);
        }
    };

    const handleResetPassword = React.useCallback(async (member: WorkspaceMemberRow) => {
        if (!member.email) return;

        toast.promise(
            apiClient.workspaces.resetPassword(workspaceId, member.id),
            {
                loading: `Sending password reset email to ${member.name}...`,
                success: (result: any) => {
                    if (result.status === "error") throw new Error(result.message);
                    return result.message || "Password reset email sent successfully";
                },
                error: (err) => err.message || "Failed to send password reset email",
            }
        );
    }, [workspaceId]);

    // Headcount workload is management information — owners, admins and managers
    // only. Everyone else does not see the Tasks Assigned column at all.
    const canSeeWorkload =
        !!layoutData?.permissions?.isWorkspaceAdmin ||
        layoutData?.permissions?.workspaceRole === "MANAGER";

    const columns = React.useMemo(() =>
        createTeamMemberColumns(
            isAdmin,
            canSeeWorkload,
            handleViewMember,
            handleEditMember,
            handleDeleteMember,
            handleResetPassword
        ),
        [isAdmin, canSeeWorkload, handleViewMember, handleEditMember, handleDeleteMember, handleResetPassword]
    );

    return (
        <>
            <DataTable
                columns={columns}
                data={data}
                searchKey="memberName"
                searchPlaceholder="Search members..."
                filterFields={departmentFilter ? [{
                    label: "Department",
                    value: "department",
                    options: [
                        { label: "No department", value: "none" },
                        ...departmentFilter.options.map((d) => ({ label: d.name, value: d.id })),
                    ],
                }] : []}
                onRowClick={handleViewMember}
                showPagination={true}
                showColumnToggle={true}
                manualPagination={!!pagination}
                manualFiltering={true}
                rowCount={pagination?.totalCount}
                pageIndex={(pagination?.page || 1) - 1}
                pageSize={pagination?.limit || 10}
                onPaginationChange={(p) => {
                    if (pagination) {
                        if (p.pageSize !== pagination.limit) {
                            pagination.onLimitChange(p.pageSize);
                        } else {
                            pagination.onPageChange(p.pageIndex + 1);
                        }
                    }
                }}
                onFilterChange={(filters) => {
                    if (pagination?.onSearchChange) {
                        const searchFilter = filters.find(f => f.id === "memberName");
                        const searchValue = searchFilter?.value as string || "";
                        pagination.onSearchChange(searchValue);
                    }
                    // Filtering is server-side (manualFiltering), so hand the
                    // selection up instead of letting the table filter one page.
                    if (departmentFilter) {
                        const deptFilter = filters.find(f => f.id === "department");
                        departmentFilter.onChange((deptFilter?.value as string[]) || []);
                    }
                }}
            />

            {/* View Member Dialog */}
            <Dialog open={viewDialogOpen} onOpenChange={setViewDialogOpen}>
                <DialogContent className="sm:max-w-3xl max-h-[88vh] overflow-y-auto rounded-3xl border-none shadow-2xl p-0">
                    {memberToView && (() => {
                        const member = memberToView;
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
                            <div className="p-8 space-y-6">
                                <DialogHeader className="flex flex-row items-start justify-between gap-4 w-full pr-4">
                                    <div className="flex items-center gap-4">
                                        <Avatar className="size-16 border-2 border-primary/20">
                                            <AvatarFallback className="text-xl font-medium">{initials}</AvatarFallback>
                                        </Avatar>
                                        <div className="text-left">
                                            <DialogTitle className="text-2xl font-medium">
                                                {member.name} {member.surname}
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
                                        {TASK_STATUS_TABS.map((t) => (
                                            <button
                                                key={t.value}
                                                type="button"
                                                onClick={() => setTaskStatus(t.value)}
                                                className={cn(
                                                    "px-3 py-1 rounded-lg font-semibold transition-all",
                                                    taskStatus === t.value
                                                        ? "bg-background text-foreground shadow-xs"
                                                        : "text-muted-foreground hover:text-foreground"
                                                )}
                                            >
                                                {t.label}
                                            </button>
                                        ))}
                                    </div>

                                    {memberTasks === null ? (
                                        <div className="space-y-2">
                                            {[0, 1, 2].map((i) => (
                                                <div key={i} className="h-12 rounded-2xl bg-muted/40 animate-pulse" />
                                            ))}
                                        </div>
                                    ) : memberTasks.length === 0 ? (
                                        <p className="text-sm italic text-muted-foreground/60 py-4 text-center">
                                            No open tasks assigned
                                        </p>
                                    ) : (
                                        <div
                                            onScroll={handleTaskScroll}
                                            className="max-h-[340px] overflow-y-auto space-y-4 pr-1"
                                        >
                                            {taskGroups.map(([projectId, tasks]) => (
                                                <div key={projectId} className="space-y-2">
                                                    <div className="flex items-center gap-2 sticky top-0 bg-background/95 backdrop-blur-sm py-1 z-10">
                                                        <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                                                            {projectNames.get(projectId) || "No project"}
                                                        </span>
                                                        <span className="text-[10px] text-muted-foreground/60">
                                                            {tasks.length}
                                                        </span>
                                                        <div className="h-px flex-1 bg-border/60" />
                                                    </div>

                                                    {tasks.map((task) => (
                                                        <div
                                                            key={task.id}
                                                            className="p-3 rounded-2xl bg-muted/30 border border-muted-foreground/5"
                                                        >
                                                            <p className="text-sm font-medium truncate">{task.name}</p>
                                                            <div className="flex items-center flex-wrap gap-2 mt-1">
                                                                {task.status && (
                                                                    <span className={cn(
                                                                        "rounded-full px-2 py-0.5 text-[10px] font-semibold",
                                                                        TASK_STATUS_COLORS[task.status] || "bg-muted text-muted-foreground"
                                                                    )}>
                                                                        {task.status.replace(/_/g, " ")}
                                                                    </span>
                                                                )}
                                                                {task.dueDate && (
                                                                    <span className="text-[11px] text-muted-foreground">
                                                                        Due {formatIST(task.dueDate, "d MMM yyyy")}
                                                                    </span>
                                                                )}
                                                            </div>
                                                        </div>
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
                        );
                    })()}
                </DialogContent>
            </Dialog>

            {/* Edit Member Dialog */}
            <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
                <DialogContent className="sm:max-w-[550px]">
                    <DialogHeader>
                        <DialogTitle>Edit Member Details</DialogTitle>
                    </DialogHeader>
                    <Form {...editForm}>
                        <form onSubmit={editForm.handleSubmit(handleEditConfirm)} className="space-y-4 py-4">
                            <div className="grid grid-cols-2 gap-4">
                                <FormField
                                    control={editForm.control}
                                    name="name"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>First Name</FormLabel>
                                            <FormControl>
                                                <Input {...field} disabled={isUpdating} />
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                                <FormField
                                    control={editForm.control}
                                    name="surname"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>Last Name</FormLabel>
                                            <FormControl>
                                                <Input {...field} value={field.value || ""} disabled={isUpdating} />
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                            </div>

                            <FormField
                                control={editForm.control}
                                name="email"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Email Address</FormLabel>
                                        <FormControl>
                                            <Input {...field} type="email" disabled={isUpdating} />
                                        </FormControl>
                                        <FormDescription>
                                            Changing email will require the user to re-verify and set a new password.
                                        </FormDescription>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />

                            <div className="grid grid-cols-2 gap-4">
                                <FormField
                                    control={editForm.control}
                                    name="employeeId"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>Employee ID</FormLabel>
                                            <FormControl>
                                                <Input {...field} value={field.value || ""} disabled={isUpdating} />
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                                <FormField
                                    control={editForm.control}
                                    name="dateOfBirth"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>Date of Birth</FormLabel>
                                            <FormControl>
                                                <Input {...field} type="date" value={field.value instanceof Date ? field.value.toISOString().split('T')[0] : (field.value || "")} disabled={isUpdating} />
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <FormField
                                    control={editForm.control}
                                    name="designation"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>Designation</FormLabel>
                                            <FormControl>
                                                <Input {...field} value={field.value || ""} disabled={isUpdating} />
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                                <FormField
                                    control={editForm.control}
                                    name="reportToId"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>Report To</FormLabel>
                                            <Select onValueChange={field.onChange} value={field.value || undefined}>
                                                <FormControl>
                                                    <SelectTrigger>
                                                        <SelectValue placeholder="Select Manager" />
                                                    </SelectTrigger>
                                                </FormControl>
                                                <SelectContent>
                                                    {managers.length > 0 ? managers.map((manager) => (
                                                        <SelectItem key={manager.id} value={manager.id}>
                                                            {manager.surname}
                                                        </SelectItem>
                                                    )) : (
                                                        <div className="p-2 text-xs text-muted-foreground">No managers found</div>
                                                    )}
                                                </SelectContent>
                                            </Select>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                            </div>

                            <FormField
                                control={editForm.control}
                                name="departmentId"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Department</FormLabel>
                                        <Select
                                            onValueChange={(value) => field.onChange(value === NO_DEPARTMENT ? "" : value)}
                                            value={field.value || NO_DEPARTMENT}
                                        >
                                            <FormControl>
                                                <SelectTrigger>
                                                    <SelectValue placeholder="Select Department" />
                                                </SelectTrigger>
                                            </FormControl>
                                            <SelectContent>
                                                <SelectItem value={NO_DEPARTMENT}>No department</SelectItem>
                                                {departments.map((department) => (
                                                    <SelectItem key={department.id} value={department.id}>
                                                        {department.name}
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />

                            <FormField
                                control={editForm.control}
                                name="phoneNumber"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Phone Number</FormLabel>
                                        <FormControl>
                                            <Input {...field} value={field.value || ""} disabled={isUpdating} />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />

                            <FormField
                                control={editForm.control}
                                name="role"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Role</FormLabel>
                                        <Select onValueChange={field.onChange} value={field.value}>
                                            <FormControl>
                                                <SelectTrigger>
                                                    <SelectValue placeholder="Select a role" />
                                                </SelectTrigger>
                                            </FormControl>
                                            <SelectContent>
                                                {workspaceMemberRole.filter(role => role !== "OWNER").map((role) => (
                                                    <SelectItem key={role} value={role}>
                                                        {role.charAt(0) + role.slice(1).toLowerCase()}
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />

                            <DialogFooter className="pt-4">
                                <Button type="button" variant="outline" onClick={() => setEditDialogOpen(false)} disabled={isUpdating}>
                                    Cancel
                                </Button>
                                <Button type="submit" disabled={isUpdating}>
                                    {isUpdating ? (
                                        <>
                                            <Loader2 className="mr-2 size-4 animate-spin" />
                                            Saving...
                                        </>
                                    ) : (
                                        "Save Changes"
                                    )}
                                </Button>
                            </DialogFooter>
                        </form>
                    </Form>
                </DialogContent>
            </Dialog>

            {/* Delete Confirmation Dialog */}
            <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Remove Member</AlertDialogTitle>
                        <AlertDialogDescription>
                            Are you sure you want to remove{" "}
                            <span className="font-medium">
                                {memberToDelete?.name}
                            </span>{" "}
                            from this workspace? They will lose access to all projects
                            and tasks in this workspace.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={handleDeleteConfirm}
                            disabled={isDeleting}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        >
                            {isDeleting ? (
                                <>
                                    <Loader2 className="mr-2 size-4 animate-spin" />
                                    Removing...
                                </>
                            ) : (
                                "Remove Member"
                            )}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </>
    );
}
