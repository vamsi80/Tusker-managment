"use client";

import { useState } from "react";
import { Building2, Loader2, Pencil, Plus, Trash2, Users } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CardDescription, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
    AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
    AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
    Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "@/lib/toast";
import {
    createDepartment, deleteDepartment, updateDepartment,
} from "@/actions/department/department-actions";
import type { Schedule } from "./shift-timings";

type Department = {
    id: string;
    name: string;
    shiftScheduleId: string | null;
    shiftSchedule: { id: string; name: string } | null;
    _count: { members: number };
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
                        {departments.map((department) => (
                            <div key={department.id} className="flex flex-wrap items-center justify-between gap-3 p-3 hover:bg-muted/20 transition-colors">
                                <div className="space-y-1">
                                    <p className="font-medium leading-none">{department.name}</p>
                                    <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
                                        <Users className="size-3 opacity-60" />
                                        {department._count.members} {department._count.members === 1 ? "member" : "members"}
                                    </p>
                                </div>

                                <div className="flex items-center gap-2">
                                    <Badge variant={department.shiftSchedule ? "secondary" : "outline"}>
                                        {department.shiftSchedule?.name ?? "Workspace default timings"}
                                    </Badge>

                                    {isWorkspaceAdmin && (
                                        <>
                                            <Button variant="ghost" size="icon" onClick={() => { setEditing(department); setDialogOpen(true); }}>
                                                <Pencil className="size-4" />
                                            </Button>
                                            <Button variant="ghost" size="icon" onClick={() => setDeleting(department)}>
                                                <Trash2 className="size-4 text-destructive" />
                                            </Button>
                                        </>
                                    )}
                                </div>
                            </div>
                        ))}
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
