"use client";

import { useState } from "react";
import { CardContent, CardDescription, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Clock, Save, Loader2, Moon, Sun, AlertCircle, Timer, ChevronRight, Send, Plus, Trash2, CalendarIcon } from "lucide-react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import type { AttendanceSettingsData, PublicHoliday } from "@/data/attendance/get-attendance-settings";

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
    const [shiftStartTime, setShiftStartTime] = useState(initialData.shiftStartTime || "21:30");
    const [lateThreshold, setLateThreshold] = useState(initialData.lateThreshold || "21:30");
    const [halfDayThreshold, setHalfDayThreshold] = useState(initialData.halfDayThreshold || "23:00");
    const [shiftEndTime, setShiftEndTime] = useState(initialData.shiftEndTime || "07:00");
    const [overtimeThreshold, setOvertimeThreshold] = useState(initialData.overtimeThreshold || "07:00");
    const [sickLeaveLimit, setSickLeaveLimit] = useState(initialData.sickLeaveLimit || 12);
    const [casualLeaveAccrualDays, setCasualLeaveAccrualDays] = useState(initialData.casualLeaveAccrualDays || 20);
    const [publicHolidays, setPublicHolidays] = useState<(PublicHoliday | { name: string; date: string })[]>(initialData.publicHolidays || []);

    const [isLoading, setIsLoading] = useState(false);
    const router = useRouter();

    const hasChanges =
        shiftStartTime !== (initialData.shiftStartTime || "21:30") ||
        lateThreshold !== (initialData.lateThreshold || "21:30") ||
        halfDayThreshold !== (initialData.halfDayThreshold || "23:00") ||
        shiftEndTime !== (initialData.shiftEndTime || "07:00") ||
        overtimeThreshold !== (initialData.overtimeThreshold || "07:00") ||
        sickLeaveLimit !== (initialData.sickLeaveLimit || 12) ||
        casualLeaveAccrualDays !== (initialData.casualLeaveAccrualDays || 20) ||
        JSON.stringify(publicHolidays) !== JSON.stringify(initialData.publicHolidays);

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
                    sickLeaveLimit,
                    casualLeaveAccrualDays,
                    publicHolidays: publicHolidays.map(h => ({
                        name: h.name,
                        date: h.date instanceof Date ? h.date.toISOString() : h.date
                    })),
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
            id: "shiftStartTime",
            label: "Shift Begins",
            description: "Official start of the working window.",
            value: shiftStartTime,
            onChange: setShiftStartTime,
            icon: <Moon className="h-4 w-4 text-indigo-500" />,
            hint: "EARLY / ON-TIME",
            hintClass: "bg-indigo-500/10 text-indigo-600 border-indigo-500/20",
        },
        {
            id: "lateThreshold",
            label: "Late Cutoff",
            description: "Mark as LATE after this time.",
            value: lateThreshold,
            onChange: setLateThreshold,
            icon: <AlertCircle className="h-4 w-4 text-amber-500" />,
            hint: "LATE",
            hintClass: "bg-amber-500/10 text-amber-600 border-amber-500/20",
        },
        {
            id: "halfDayThreshold",
            label: "Half Day Cutoff",
            description: "Mark as HALF DAY after this time.",
            value: halfDayThreshold,
            onChange: setHalfDayThreshold,
            icon: <Timer className="h-4 w-4 text-orange-500" />,
            hint: "HALF DAY",
            hintClass: "bg-orange-500/10 text-orange-600 border-orange-500/20",
        },
        {
            id: "overtimeThreshold",
            label: "Shift Ends / OT",
            description: "Overtime begins after this threshold.",
            value: overtimeThreshold,
            onChange: (val: string) => {
                setOvertimeThreshold(val);
                setShiftEndTime(val);
            },
            icon: <Sun className="h-4 w-4 text-purple-500" />,
            hint: "OT",
            hintClass: "bg-purple-500/10 text-purple-600 border-purple-500/20",
        },
        {
            id: "sickLeaveLimit",
            label: "Yearly Sick Leave Quota",
            description: "Fixed number of sick leaves granted per year.",
            value: sickLeaveLimit,
            isInput: true,
            onChange: setSickLeaveLimit,
            icon: <Plus className="h-4 w-4 text-rose-500" />,
            hint: "SICK",
            hintClass: "bg-rose-500/10 text-rose-600 border-rose-500/20",
        },
        {
            id: "casualLeaveAccrualDays",
            label: "Casual Leave Accrual",
            description: "Days of presence required to earn 1 casual leave.",
            value: casualLeaveAccrualDays,
            isInput: true,
            onChange: setCasualLeaveAccrualDays,
            icon: <Plus className="h-4 w-4 text-emerald-500" />,
            hint: "CASUAL",
            hintClass: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20",
        },
    ] as const;

    return (
        <div className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
                {/* Left Side: Attendance Rules */}
                <div className="lg:col-span-8 space-y-6">
                    <div className="flex flex-col gap-1">
                        <CardTitle className="text-xl flex items-center gap-2">
                            <Clock className="h-4 w-4" />
                            Attendance Rules
                        </CardTitle>
                        <CardDescription className="text-base">
                            Define the thresholds for check-ins and overtime tracking.
                        </CardDescription>
                    </div>

                    <div className="grid gap-4">
                        {/* Timeline Visualizer */}
                        {/* <div className="flex items-center gap-2 p-3 rounded-xl bg-muted/30 border border-muted-foreground/10 overflow-x-auto no-scrollbar whitespace-nowrap">
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
                        </div> */}

                        {/* In-line Settings Rows */}
                        <div className="divide-y divide-border rounded-lg border bg-card/30 backdrop-blur-md overflow-hidden shadow-sm">
                            {rows.map((r) => (
                                <div key={r.id} className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-2 hover:bg-muted/20 transition-colors">
                                    <div className="space-y-1">
                                        <Label className="text-base font-normal flex items-center gap-2 leading-none">
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
                                        {(r as any).isInput ? (
                                            <div className="flex items-center gap-2">
                                                <Input
                                                    type="number"
                                                    value={r.value}
                                                    onChange={(e) => (r as any).onChange(parseInt(e.target.value) || 0)}
                                                    className="w-20 h-9 bg-background/50 border-muted-foreground/20 text-center font-bold"
                                                    disabled={!isAdmin || isLoading}
                                                />
                                                <span className="text-xs text-muted-foreground font-medium">
                                                    {r.id === "sickLeaveLimit" ? "Days" : "Days Presence"}
                                                </span>
                                            </div>
                                        ) : (
                                            <TimePicker12
                                                value={r.value as string}
                                                onChange={r.onChange as any}
                                                disabled={!isAdmin || isLoading}
                                            />
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Right Side: Public Holidays */}
                <div className="lg:col-span-4 space-y-6">
                    <div className="flex flex-col gap-1">
                        <CardTitle className="text-xl flex items-center gap-2">
                            <CalendarIcon className="h-4 w-4" />
                            Public Holidays
                        </CardTitle>
                        <CardDescription className="text-base">
                            Annual list of paid holidays.
                        </CardDescription>
                    </div>

                    <div className="p-2 rounded-lg border bg-card/30 backdrop-blur-md shadow-sm space-y-4">
                        <div className="space-y-3 max-h-[300px] overflow-y-auto pr-2 no-scrollbar">
                            {publicHolidays.length === 0 ? (
                                <div className="text-center py-8 border-2 border-dashed rounded-xl border-muted-foreground/10">
                                    <p className="text-sm text-muted-foreground">No holidays added yet.</p>
                                </div>
                            ) : (
                                publicHolidays.map((holiday, idx) => (
                                    <div key={idx} className="flex items-center gap-3 p-3 bg-muted/20 rounded-xl border border-muted-foreground/5 group animate-in fade-in slide-in-from-right-2 duration-300">
                                        <div className="flex-1 space-y-1">
                                            <Input
                                                value={holiday.name}
                                                onChange={(e) => {
                                                    const newHolidays = [...publicHolidays];
                                                    newHolidays[idx].name = e.target.value;
                                                    setPublicHolidays(newHolidays);
                                                }}
                                                placeholder="Holiday Name"
                                                className="h-8 text-sm font-bold bg-transparent border-none p-0 focus-visible:ring-0"
                                                disabled={!isAdmin || isLoading}
                                            />
                                            <input
                                                type="date"
                                                value={holiday.date instanceof Date ? holiday.date.toISOString().split('T')[0] : (holiday.date as string).split('T')[0]}
                                                onChange={(e) => {
                                                    const newHolidays = [...publicHolidays];
                                                    newHolidays[idx].date = e.target.value;
                                                    setPublicHolidays(newHolidays);
                                                }}
                                                className="bg-transparent border-none text-[10px] text-muted-foreground font-medium focus:outline-none block w-full"
                                                disabled={!isAdmin || isLoading}
                                            />
                                        </div>
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            onClick={() => {
                                                const newHolidays = publicHolidays.filter((_, i) => i !== idx);
                                                setPublicHolidays(newHolidays);
                                            }}
                                            className="h-8 w-8 text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
                                            disabled={!isAdmin || isLoading}
                                        >
                                            <Trash2 className="h-4 w-4" />
                                        </Button>
                                    </div>
                                ))
                            )}
                        </div>

                        <Button
                            variant="outline"
                            className="w-full border-dashed border-2 hover:bg-primary/5 hover:border-primary/50 transition-all gap-2 h-11 font-bold rounded-xl"
                            onClick={() => {
                                setPublicHolidays([...publicHolidays, { name: "New Holiday", date: new Date().toISOString() }]);
                            }}
                            disabled={!isAdmin || isLoading}
                        >
                            <Plus className="h-4 w-4" />
                            Add Holiday
                        </Button>
                    </div>
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
