"use client";

import { useState } from "react";
import Link from "next/link";
import { Building2, ChevronDown, ExternalLink, Loader2, Pencil, Plus, Trash2, Users } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CardDescription, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
    AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
    AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
    Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import {
    createDepartment, deleteDepartment, updateDepartment,
} from "@/actions/department/department-actions";
import type { DepartmentMember } from "@/data/department/get-departments";
import type { Schedule } from "./shift-timings";

type Department = {
    id: string;
    name: string;
    shiftScheduleId: string | null;
    shiftSchedule: { id: string; name: string } | null;
    _count: { members: number };
    members?: DepartmentMember[];
};

interface DepartmentsManagerProps {
    workspaceId: string;
    departments: Department[];
    schedules: Schedule[];
    isWorkspaceAdmin: boolean;
}

// Sentinel for "no schedule" — Radix Select cannot hold an empty string value.
const NO_SCHEDULE = "__none__";

export function DepartmentsManager({ workspaceId, departments, schedules, isWorkspaceAdmin }: DepartmentsManagerProps) {
    const [dialogOpen, setDialogOpen] = useState(false);
    const [editing, setEditing] = useState<Department | null>(null);
    const [deleting, setDeleting] = useState<Department | null>(null);
    const [isDeleting, setIsDeleting] = useState(false);
    const [expandedDepts, setExpandedDepts] = useState<Record<string, boolean>>({});

    const toggleDept = (id: string) => {
        setExpandedDepts(prev => ({ ...prev, [id]: !prev[id] }));
    };

    const handleDelete = async () => {
        if (!isWorkspaceAdmin || !deleting) return;
        setIsDeleting(true);
        try {
            const result = await deleteDepartment({ id: deleting.id, workspaceId });
            if (result.success) {
                toast.success(`Department "${deleting.name}" deleted. Its members were kept and are now unassigned.`);
                setDeleting(null);
            } else {
                toast.error(result.error || "Failed to delete department");
            }
        } finally {
            setIsDeleting(false);
        }
    };

    return (
        <div className="space-y-8">
            {/* ─── Departments ───────────────────────────────────────────── */}
            {/* Shift timings now live on the Team > Settings > Attendance tab. */}
            <div className="space-y-4">
                <div className="flex flex-wrap items-end justify-between gap-3">
                    <div className="flex flex-col gap-1">
                        <CardTitle className="text-xl flex items-center gap-2">
                            <Building2 className="size-4" />
                            Departments
                        </CardTitle>
                        <CardDescription className="text-base">
                            Assign people to a department from the team page. Anyone without one
                            keeps the workspace-wide timings.
                        </CardDescription>
                    </div>

                    {isWorkspaceAdmin && (
                        <Button onClick={() => { setEditing(null); setDialogOpen(true); }} className="gap-2">
                            <Plus className="size-4" />
                            Add Department
                        </Button>
                    )}
                </div>

                {departments.length === 0 ? (
                    <div className="rounded-lg border border-dashed p-10 text-center">
                        <Building2 className="mx-auto size-8 text-muted-foreground/40" />
                        <p className="mt-3 text-sm text-muted-foreground">
                            No departments yet. Everyone currently follows the workspace-wide timings.
                        </p>
                    </div>
                ) : (
                    <div className="divide-y divide-border rounded-lg border bg-card/30 overflow-hidden shadow-sm">
                        {departments.map((department) => {
                            const isExpanded = !!expandedDepts[department.id];
                            const members = department.members ?? [];
                            const memberCount = department._count.members;

                            return (
                                <Collapsible
                                    key={department.id}
                                    open={isExpanded}
                                    onOpenChange={() => toggleDept(department.id)}
                                    className="transition-colors"
                                >
                                    <div className="flex flex-wrap items-center justify-between gap-3 p-3.5 hover:bg-muted/10 transition-colors">
                                        <div className="flex items-center gap-3">
                                            <CollapsibleTrigger asChild>
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    className="size-7 rounded-md text-muted-foreground hover:text-foreground"
                                                    aria-label={isExpanded ? "Collapse members" : "Expand members"}
                                                >
                                                    <ChevronDown className={cn("size-4 transition-transform duration-200", !isExpanded && "-rotate-90")} />
                                                </Button>
                                            </CollapsibleTrigger>

                                            <div className="space-y-1">
                                                <div className="flex items-center gap-2">
                                                    <p className="font-medium text-sm leading-none">{department.name}</p>
                                                </div>

                                                {/* Dropdown trigger pill */}
                                                <CollapsibleTrigger asChild>
                                                    <button
                                                        type="button"
                                                        className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors group cursor-pointer"
                                                    >
                                                        <Users className="size-3 opacity-70 group-hover:opacity-100" />
                                                        <span className="underline-offset-2 group-hover:underline">
                                                            {memberCount} {memberCount === 1 ? "member" : "members"}
                                                        </span>
                                                        <ChevronDown className={cn("size-3 opacity-60 transition-transform duration-200", !isExpanded && "-rotate-90")} />
                                                    </button>
                                                </CollapsibleTrigger>
                                            </div>
                                        </div>

                                        <div className="flex items-center gap-2">
                                            <Badge variant={department.shiftSchedule ? "secondary" : "outline"} className="text-xs">
                                                {department.shiftSchedule?.name ?? "Workspace default timings"}
                                            </Badge>

                                            {isWorkspaceAdmin && (
                                                <>
                                                    <Button variant="ghost" size="icon" className="size-8" onClick={() => { setEditing(department); setDialogOpen(true); }}>
                                                        <Pencil className="size-3.5" />
                                                    </Button>
                                                    <Button variant="ghost" size="icon" className="size-8" onClick={() => setDeleting(department)}>
                                                        <Trash2 className="size-3.5 text-destructive" />
                                                    </Button>
                                                </>
                                            )}
                                        </div>
                                    </div>

                                    <CollapsibleContent>
                                        <div className="border-t bg-muted/15 px-4 py-3">
                                            <div className="flex items-center justify-between mb-2.5">
                                                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                                                    Members in {department.name} ({memberCount})
                                                </p>
                                                <Link
                                                    href={`/w/${workspaceId}/team`}
                                                    className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                                                >
                                                    Manage on Team page
                                                    <ExternalLink className="size-3" />
                                                </Link>
                                            </div>

                                            {members.length === 0 ? (
                                                <div className="rounded-md border border-dashed bg-background/60 p-4 text-center">
                                                    <Users className="mx-auto size-5 text-muted-foreground/40 mb-1" />
                                                    <p className="text-xs text-muted-foreground">
                                                        No members currently assigned to this department.
                                                    </p>
                                                    <p className="text-[11px] text-muted-foreground/80 mt-0.5">
                                                        Go to the Team page to assign members to &quot;{department.name}&quot;.
                                                    </p>
                                                </div>
                                            ) : (
                                                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                                                    {members.map((member) => {
                                                        const fullName = [member.user.name, member.user.surname].filter(Boolean).join(" ");
                                                        const initials = (member.user.name?.[0] || member.user.email?.[0] || "?").toUpperCase();
                                                        return (
                                                            <div
                                                                key={member.id}
                                                                className="flex items-center gap-2.5 rounded-lg border bg-background/80 p-2 shadow-xs hover:border-primary/30 transition-colors"
                                                            >
                                                                <Avatar className="size-7 shrink-0">
                                                                    {member.user.image && <AvatarImage src={member.user.image} alt={fullName} />}
                                                                    <AvatarFallback className="text-[10px] font-medium bg-muted">
                                                                        {initials}
                                                                    </AvatarFallback>
                                                                </Avatar>
                                                                <div className="min-w-0 flex-1">
                                                                    <div className="flex items-center justify-between gap-1">
                                                                        <p className="truncate text-xs font-medium text-foreground">{fullName}</p>
                                                                        {member.workspaceRole && member.workspaceRole !== "MEMBER" && (
                                                                            <Badge variant="outline" className="px-1 py-0 text-[9px] font-normal leading-tight">
                                                                                {member.workspaceRole.toLowerCase()}
                                                                            </Badge>
                                                                        )}
                                                                    </div>
                                                                    <p className="truncate text-[11px] text-muted-foreground">{member.user.email}</p>
                                                                    {member.designation && (
                                                                        <p className="truncate text-[10px] text-muted-foreground/75 font-mono">
                                                                            {member.designation}
                                                                        </p>
                                                                    )}
                                                                </div>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            )}
                                        </div>
                                    </CollapsibleContent>
                                </Collapsible>
                            );
                        })}
                    </div>
                )}
            </div>

            <DepartmentDialog
                key={editing?.id ?? "new"}
                open={dialogOpen}
                onOpenChange={setDialogOpen}
                workspaceId={workspaceId}
                department={editing}
                schedules={schedules}
                isWorkspaceAdmin={isWorkspaceAdmin}
            />

            <AlertDialog open={!!deleting} onOpenChange={(open) => !open && setDeleting(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Delete &quot;{deleting?.name}&quot;?</AlertDialogTitle>
                        <AlertDialogDescription>
                            {deleting?._count.members
                                ? `${deleting._count.members} ${deleting._count.members === 1 ? "person is" : "people are"} in this department. They will be kept and become unassigned, falling back to the workspace-wide timings.`
                                : "This department has no members."}
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={(e) => { e.preventDefault(); handleDelete(); }}
                            disabled={isDeleting}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        >
                            {isDeleting ? <Loader2 className="size-4 animate-spin" /> : "Delete"}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}

// ─── Create / edit dialog ────────────────────────────────────────────────────

function DepartmentDialog({ open, onOpenChange, workspaceId, department, schedules, isWorkspaceAdmin }: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    workspaceId: string;
    department: Department | null;
    schedules: Schedule[];
    isWorkspaceAdmin: boolean;
}) {
    const [name, setName] = useState(department?.name ?? "");
    const [scheduleId, setScheduleId] = useState(department?.shiftScheduleId ?? NO_SCHEDULE);
    const [isSubmitting, setIsSubmitting] = useState(false);

    const handleSubmit = async () => {
        if (!isWorkspaceAdmin || !name.trim()) return;
        setIsSubmitting(true);
        try {
            const payload = {
                ...(department ? { id: department.id } : {}),
                name: name.trim(),
                shiftScheduleId: scheduleId === NO_SCHEDULE ? null : scheduleId,
                workspaceId,
            };
            const result = department ? await updateDepartment(payload) : await createDepartment(payload);

            if (result.success) {
                toast.success(`Department "${name.trim()}" ${department ? "updated" : "created"}.`);
                onOpenChange(false);
            } else {
                toast.error(result.error || "Something went wrong");
            }
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>{department ? "Edit Department" : "New Department"}</DialogTitle>
                    <DialogDescription>
                        Pick the shift its members are held to. Leave it on the workspace default
                        to keep the current timings.
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-4 py-2">
                    <div className="space-y-2">
                        <Label htmlFor="department-name">Name</Label>
                        <Input
                            id="department-name"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            placeholder="e.g. Production"
                            disabled={isSubmitting}
                        />
                    </div>

                    <div className="space-y-2">
                        <Label>Shift Timings</Label>
                        <Select value={scheduleId} onValueChange={setScheduleId} disabled={isSubmitting}>
                            <SelectTrigger>
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value={NO_SCHEDULE}>Workspace default timings</SelectItem>
                                {schedules.map((s) => (
                                    <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
                        Cancel
                    </Button>
                    <Button onClick={handleSubmit} disabled={!isWorkspaceAdmin || !name.trim() || isSubmitting}>
                        {isSubmitting && <Loader2 className="size-4 animate-spin mr-2" />}
                        {department ? "Save" : "Create"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
