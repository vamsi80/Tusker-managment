"use client";

import { useEffect, useState } from "react";
import { AlertCircle, Clock, Loader2, Moon, Save, Sun, Timer } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CardDescription, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { TimePicker12 } from "@/components/shared/time-picker-12";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import { updateShiftSchedule } from "@/actions/department/department-actions";

export type Schedule = {
    id: string;
    name: string;
    lateThreshold: string;
    halfDayThreshold: string;
    shiftStartTime: string;
    shiftEndTime: string;
    overtimeThreshold: string;
    _count: { departments: number };
};

/**
 * The workspace's shift schedules ("Head Office", "Factory"), each editable in
 * place. Departments point at one of these, so a change here moves every
 * department on that shift at once.
 */
export function ShiftTimings({ workspaceId, schedules, isWorkspaceAdmin }: {
    workspaceId: string;
    schedules: Schedule[];
    isWorkspaceAdmin: boolean;
}) {
    return (
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
    );
}

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
