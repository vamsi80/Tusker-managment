"use client";

import { useState } from "react";
import { CardContent, CardDescription, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Clock, Save, Loader2, Moon, Sun, AlertCircle, Timer, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import type { AttendanceSettingsData } from "@/data/attendance/get-attendance-settings";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function to12h(time24: string) {
    const [h, m] = time24.split(":").map(Number);
    const period = h >= 12 ? "PM" : "AM";
    const hour12 = h % 12 === 0 ? 12 : h % 12;
    return { hour12: String(hour12), minute: String(m).padStart(2, "0"), period };
}

function to24h(hour12: string, minute: string, period: string): string {
    let h = parseInt(hour12, 10);
    if (period === "AM" && h === 12) h = 0;
    if (period === "PM" && h !== 12) h += 12;
    return `${String(h).padStart(2, "0")}:${minute}`;
}

const HOURS = Array.from({ length: 12 }, (_, i) => String(i + 1));
const MINUTES = Array.from({ length: 60 }, (_, i) => String(i).padStart(2, "0"));

interface TimePicker12Props {
    value: string;
    onChange: (v: string) => void;
    disabled?: boolean;
}

function TimePicker12({ value, onChange, disabled }: TimePicker12Props) {
    const { hour12, minute, period } = to12h(value);
    const update = (h: string, m: string, p: string) => onChange(to24h(h, m, p));

    return (
        <div className="flex items-center gap-1.5">
            <Select value={hour12} onValueChange={(h) => update(h, minute, period)} disabled={disabled}>
                <SelectTrigger className="w-[64px] h-9 bg-background/50 border-muted-foreground/20 font-medium text-sm">
                    <SelectValue />
                </SelectTrigger>
                <SelectContent>
                    {HOURS.map((h) => (
                        <SelectItem key={h} value={h}>{h}</SelectItem>
                    ))}
                </SelectContent>
            </Select>

            <span className="text-muted-foreground font-bold">:</span>

            <Select value={minute} onValueChange={(m) => update(hour12, m, period)} disabled={disabled}>
                <SelectTrigger className="w-[64px] h-9 bg-background/50 border-muted-foreground/20 font-medium text-sm">
                    <SelectValue />
                </SelectTrigger>
                <SelectContent>
                    {MINUTES.map((m) => (
                        <SelectItem key={m} value={m}>{m}</SelectItem>
                    ))}
                </SelectContent>
            </Select>

            <Select value={period} onValueChange={(p) => update(hour12, minute, p)} disabled={disabled}>
                <SelectTrigger className="w-[64px] h-9 bg-background/50 border-muted-foreground/20 font-medium text-sm">
                    <SelectValue />
                </SelectTrigger>
                <SelectContent>
                    <SelectItem value="AM">AM</SelectItem>
                    <SelectItem value="PM">PM</SelectItem>
                </SelectContent>
            </Select>
        </div>
    );
}

// ─── Main Component ───────────────────────────────────────────────────────────

interface AttendanceSettingsProps {
    workspaceId: string;
    initialData: AttendanceSettingsData;
    isAdmin: boolean;
}

export function AttendanceSettings({ workspaceId, initialData, isAdmin }: AttendanceSettingsProps) {
    const [shiftStartTime,    setShiftStartTime]    = useState(initialData.shiftStartTime    || "21:30");
    const [lateThreshold,     setLateThreshold]     = useState(initialData.lateThreshold     || "21:30");
    const [halfDayThreshold,  setHalfDayThreshold]  = useState(initialData.halfDayThreshold  || "23:00");
    const [shiftEndTime,      setShiftEndTime]       = useState(initialData.shiftEndTime      || "07:00");
    const [overtimeThreshold, setOvertimeThreshold] = useState(initialData.overtimeThreshold || "07:00");

    const [isLoading, setIsLoading] = useState(false);
    const router = useRouter();

    const hasChanges =
        shiftStartTime    !== (initialData.shiftStartTime    || "21:30") ||
        lateThreshold     !== (initialData.lateThreshold     || "21:30") ||
        halfDayThreshold  !== (initialData.halfDayThreshold  || "23:00") ||
        shiftEndTime      !== (initialData.shiftEndTime      || "07:00") ||
        overtimeThreshold !== (initialData.overtimeThreshold || "07:00");

    const handleSave = async () => {
        if (!isAdmin) return;
        try {
            setIsLoading(true);
            const res = await fetch(`/api/v1/attendance/settings`, {
                method: "PATCH",
                headers: {
                    "Content-Type": "application/json",
                    "x-workspace-id": workspaceId,
                },
                body: JSON.stringify({
                    lateThreshold,
                    overtimeThreshold,
                    halfDayThreshold,
                    shiftStartTime,
                    shiftEndTime,
                }),
            });

            const data = await res.json();
            if (res.ok && data.success) {
                toast.success("Attendance settings updated successfully");
                router.refresh();
            } else {
                toast.error(data.error || "Failed to update settings");
            }
        } catch (error) {
            console.error("Error saving settings:", error);
            toast.error("An error occurred while saving settings");
        } finally {
            setIsLoading(false);
        }
    };

    const rows = [
        {
            id:          "shiftStartTime",
            label:       "Shift Begins",
            description: "Official start of the working window.",
            value:       shiftStartTime,
            onChange:    setShiftStartTime,
            icon:        <Moon className="h-4 w-4 text-indigo-500" />,
            hint:        "EARLY / ON-TIME",
            hintClass:   "bg-indigo-500/10 text-indigo-600 border-indigo-500/20",
        },
        {
            id:          "lateThreshold",
            label:       "Late Cutoff",
            description: "Mark as LATE after this time.",
            value:       lateThreshold,
            onChange:    setLateThreshold,
            icon:        <AlertCircle className="h-4 w-4 text-amber-500" />,
            hint:        "LATE",
            hintClass:   "bg-amber-500/10 text-amber-600 border-amber-500/20",
        },
        {
            id:          "halfDayThreshold",
            label:       "Half Day Cutoff",
            description: "Mark as HALF DAY after this time.",
            value:       halfDayThreshold,
            onChange:    setHalfDayThreshold,
            icon:        <Timer className="h-4 w-4 text-orange-500" />,
            hint:        "HALF DAY",
            hintClass:   "bg-orange-500/10 text-orange-600 border-orange-500/20",
        },
        {
            id:          "overtimeThreshold",
            label:       "Shift Ends / OT",
            description: "Overtime begins after this threshold.",
            value:       overtimeThreshold,
            onChange:    (val: string) => {
                setOvertimeThreshold(val);
                setShiftEndTime(val); // Keep these synced for simplicity in night shifts
            },
            icon:        <Sun className="h-4 w-4 text-purple-500" />,
            hint:        "OT",
            hintClass:   "bg-purple-500/10 text-purple-600 border-purple-500/20",
        },
    ] as const;

    return (
        <div className="space-y-6">
            <div className="flex flex-col gap-1">
                <CardTitle className="text-2xl font-bold flex items-center gap-2">
                    <Clock className="h-6 w-6 text-primary" />
                    Attendance Rules
                </CardTitle>
                <CardDescription className="text-base">
                    Define the thresholds for check-ins and overtime tracking.
                </CardDescription>
            </div>

            <div className="grid gap-4">
                {/* Timeline Visualizer */}
                <div className="flex items-center gap-2 p-3 rounded-xl bg-muted/30 border border-muted-foreground/10 overflow-x-auto no-scrollbar whitespace-nowrap">
                    <div className="flex items-center gap-1.5 text-xs font-bold text-indigo-500 shrink-0">
                        <Moon className="h-3 w-3" /> START
                    </div>
                    <ChevronRight className="h-3 w-3 text-muted-foreground/30 shrink-0" />
                    <div className="flex items-center gap-1.5 text-xs font-bold text-amber-500 shrink-0">
                        <AlertCircle className="h-3 w-3" /> LATE
                    </div>
                    <ChevronRight className="h-3 w-3 text-muted-foreground/30 shrink-0" />
                    <div className="flex items-center gap-1.5 text-xs font-bold text-orange-500 shrink-0">
                        <Timer className="h-3 w-3" /> HALF DAY
                    </div>
                    <ChevronRight className="h-3 w-3 text-muted-foreground/30 shrink-0" />
                    <div className="flex items-center gap-1.5 text-xs font-bold text-purple-500 shrink-0">
                        <Sun className="h-3 w-3" /> OVERTIME
                    </div>
                </div>

                {/* In-line Settings Rows */}
                <div className="divide-y divide-border rounded-2xl border bg-card/30 backdrop-blur-md overflow-hidden shadow-sm">
                    {rows.map((r) => (
                        <div key={r.id} className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-5 hover:bg-muted/20 transition-colors">
                            <div className="space-y-1">
                                <Label className="text-base font-bold flex items-center gap-2 leading-none">
                                    {r.icon}
                                    {r.label}
                                </Label>
                                <p className="text-sm text-muted-foreground">
                                    {r.description}
                                </p>
                            </div>
                            
                            <div className="flex flex-wrap items-center gap-3 md:justify-end">
                                <div className={cn("px-2 py-1 rounded-md border text-[10px] font-black uppercase tracking-tighter shrink-0", r.hintClass)}>
                                    {r.hint}
                                </div>
                                <TimePicker12
                                    value={r.value}
                                    onChange={r.onChange}
                                    disabled={!isAdmin || isLoading}
                                />
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {isAdmin && (
                <div className="flex justify-end pt-2">
                    <Button
                        onClick={handleSave}
                        disabled={isLoading || !hasChanges}
                        className={cn(
                            "h-12 px-10 gap-3 shadow-xl transition-all active:scale-95 text-base font-bold rounded-xl",
                            hasChanges
                                ? "bg-primary hover:bg-primary/90 shadow-primary/20 scale-[1.02]"
                                : "bg-muted text-muted-foreground shadow-none cursor-not-allowed opacity-50"
                        )}
                    >
                        {isLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Save className="h-5 w-5" />}
                        Apply All Changes
                    </Button>
                </div>
            )}
        </div>
    );
}
