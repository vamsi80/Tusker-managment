"use client";

import { useEffect, useState } from "react";
import { AlertCircle, Building2, Clock, Loader2, Moon, Pencil, Plus, Save, Sun, Timer, Trash2, Users } from "lucide-react";

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
import { TimePicker12 } from "@/components/shared/time-picker-12";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import {
    createDepartment, deleteDepartment, updateDepartment, updateShiftSchedule,
} from "@/actions/department/department-actions";

type Schedule = {
    id: string;
    name: string;
    lateThreshold: string;
    halfDayThreshold: string;
    shiftStartTime: string;
    shiftEndTime: string;
    overtimeThreshold: string;
    _count: { departments: number };
};

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
            {/* ─── Shift timings ─────────────────────────────────────────── */}
            <div className="space-y-4">
                <div className="flex flex-col gap-1">
                    <CardTitle className="text-xl flex items-center gap-2">
                        <Clock className="size-4" />
                        Shift Timings
                    </CardTitle>
                    <CardDescription className="text-base">
                        Every department follows one of these. Change a timing here and it applies
                        to every department on that shift at once.
                    </CardDescription>
                </div>

                {schedules.length === 0 ? (
                    <p className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
                        No shift timings found for this workspace.
                    </p>
                ) : (
                    <div className="grid gap-4 lg:grid-cols-2">
                        {schedules.map((schedule) => (
                            <ScheduleCard
                                key={schedule.id}
                                workspaceId={workspaceId}
                                schedule={schedule}
                                isWorkspaceAdmin={isWorkspaceAdmin}
                            />
                        ))}
                    </div>
                )}
            </div>

            {/* ─── Departments ───────────────────────────────────────────── */}
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

// ─── Shift schedule card ─────────────────────────────────────────────────────

function ScheduleCard({ workspaceId, schedule, isWorkspaceAdmin }: {
    workspaceId: string;
    schedule: Schedule;
    isWorkspaceAdmin: boolean;
}) {
    const [times, setTimes] = useState({
        shiftStartTime: schedule.shiftStartTime,
        lateThreshold: schedule.lateThreshold,
        halfDayThreshold: schedule.halfDayThreshold,
        overtimeThreshold: schedule.overtimeThreshold,
        shiftEndTime: schedule.shiftEndTime,
    });
    const [isSaving, setIsSaving] = useState(false);

    // Re-sync when the server sends fresh values back after a save.
    useEffect(() => {
        setTimes({
            shiftStartTime: schedule.shiftStartTime,
            lateThreshold: schedule.lateThreshold,
            halfDayThreshold: schedule.halfDayThreshold,
            overtimeThreshold: schedule.overtimeThreshold,
            shiftEndTime: schedule.shiftEndTime,
        });
    }, [schedule]);

    const hasChanges =
        times.shiftStartTime !== schedule.shiftStartTime ||
        times.lateThreshold !== schedule.lateThreshold ||
        times.halfDayThreshold !== schedule.halfDayThreshold ||
        times.overtimeThreshold !== schedule.overtimeThreshold;

    const rows = [
        { id: "shiftStartTime", label: "Shift Begins", value: times.shiftStartTime, icon: <Moon className="size-4 text-indigo-500" />, hint: "START", hintClass: "bg-indigo-500/10 text-indigo-600 border-indigo-500/20", onChange: (v: string) => setTimes((t) => ({ ...t, shiftStartTime: v })) },
        { id: "lateThreshold", label: "Late Cutoff", value: times.lateThreshold, icon: <AlertCircle className="size-4 text-amber-500" />, hint: "LATE", hintClass: "bg-amber-500/10 text-amber-600 border-amber-500/20", onChange: (v: string) => setTimes((t) => ({ ...t, lateThreshold: v })) },
        { id: "halfDayThreshold", label: "Half Day Cutoff", value: times.halfDayThreshold, icon: <Timer className="size-4 text-orange-500" />, hint: "HALF DAY", hintClass: "bg-orange-500/10 text-orange-600 border-orange-500/20", onChange: (v: string) => setTimes((t) => ({ ...t, halfDayThreshold: v })) },
        // Shift end and the OT threshold are the same instant, exactly as the
        // workspace-wide settings panel treats them.
        { id: "overtimeThreshold", label: "Shift Ends / OT", value: times.overtimeThreshold, icon: <Sun className="size-4 text-purple-500" />, hint: "OT", hintClass: "bg-purple-500/10 text-purple-600 border-purple-500/20", onChange: (v: string) => setTimes((t) => ({ ...t, overtimeThreshold: v, shiftEndTime: v })) },
    ];

    const handleSave = async () => {
        if (!isWorkspaceAdmin) return;
        setIsSaving(true);
        try {
            const result = await updateShiftSchedule({ id: schedule.id, workspaceId, ...times });
            if (result.success) {
                toast.success(`${schedule.name} timings updated.`);
            } else {
                toast.error(result.error || "Failed to update timings");
            }
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div className="rounded-lg border bg-card/30 shadow-sm overflow-hidden">
            <div className="flex items-center justify-between gap-2 border-b bg-muted/20 px-3 py-2">
                <div className="flex items-center gap-2">
                    <span className="font-semibold">{schedule.name}</span>
                    <Badge variant="outline" className="text-[10px]">
                        {schedule._count.departments} {schedule._count.departments === 1 ? "dept" : "depts"}
                    </Badge>
                </div>
                <Button size="sm" onClick={handleSave} disabled={!isWorkspaceAdmin || !hasChanges || isSaving} className="gap-2">
                    {isSaving ? <Loader2 className="size-3.5 animate-spin" /> : <Save className="size-3.5" />}
                    Save
                </Button>
            </div>

            <div className="divide-y divide-border">
                {rows.map((r) => (
                    <div key={r.id} className="flex flex-col md:flex-row md:items-center justify-between gap-3 p-2">
                        <Label className="text-base font-normal flex items-center gap-2 leading-none">
                            {r.icon}
                            {r.label}
                        </Label>
                        <div className="flex flex-wrap items-center gap-3 md:justify-end">
                            <div className={cn("px-2 py-1 rounded-md border text-[10px] font-black uppercase tracking-tighter shrink-0", r.hintClass)}>
                                {r.hint}
                            </div>
                            <TimePicker12 value={r.value} onChange={r.onChange} disabled={!isWorkspaceAdmin || isSaving} />
                        </div>
                    </div>
                ))}
            </div>
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
