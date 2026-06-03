"use client";

import { useState } from "react";
import { CardContent, CardDescription, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Clock, Save, Loader2, Moon, Sun, AlertCircle, Timer, ChevronRight, Send, Plus, Trash2, CalendarIcon, MapPin } from "lucide-react";
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
    const [attendanceLocations, setAttendanceLocations] = useState<any[]>(initialData.attendanceLocations || []);

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
        JSON.stringify(publicHolidays) !== JSON.stringify(initialData.publicHolidays) ||
        JSON.stringify(attendanceLocations) !== JSON.stringify(initialData.attendanceLocations);

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
                    attendanceLocations: attendanceLocations.map(l => ({
                        id: l.id,
                        name: l.name,
                        address: l.address,
                        latitude: parseFloat(l.latitude),
                        longitude: parseFloat(l.longitude),
                        radius: parseFloat(l.radius || 100),
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


    const handleSearchAddress = async (idx: number, searchStr: string) => {
        if (!searchStr) return;
        try {
            setIsLoading(true);

            // 1. Check if it's a Google Maps URL
            const markerMatch = searchStr.match(/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/);
            const queryMatch = searchStr.match(/[?&]q=(-?\d+\.\d+),(-?\d+\.\d+)/);
            const llMatch = searchStr.match(/[?&]ll=(-?\d+\.\d+),(-?\d+\.\d+)/);
            const viewportMatch = searchStr.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);

            const match = markerMatch || queryMatch || llMatch || viewportMatch;

            if (match) {
                const lat = parseFloat(match[1]);
                const lon = parseFloat(match[2]);

                const newLocs = attendanceLocations.map((loc, i) =>
                    i === idx ? { ...loc, latitude: lat, longitude: lon } : loc
                );
                setAttendanceLocations(newLocs);

                // Reverse geocode to get the address name
                const revRes = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}`);
                const revData = await revRes.json();
                if (revData && revData.display_name) {
                    const locs = attendanceLocations.map((loc, i) =>
                        i === idx ? { ...loc, address: revData.display_name } : loc
                    );
                    setAttendanceLocations(locs);
                }

                toast.success(`Location extracted from URL!`);
                return;
            }

            // 2. Regular Search (Geocoding)
            const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(searchStr)}&limit=1`);
            const data = await res.json();
            if (data && data.length > 0) {
                const { lat, lon, display_name } = data[0];
                const newLocs = attendanceLocations.map((loc, i) =>
                    i === idx ? { ...loc, latitude: parseFloat(lat), longitude: parseFloat(lon), address: display_name } : loc
                );
                setAttendanceLocations(newLocs);
                toast.success(`Location found!`);
            } else {
                toast.error("Could not find coordinates for this address.");
            }
        } catch (error) {
            console.error("Geocoding error:", error);
            toast.error("Error searching for address.");
        } finally {
            setIsLoading(false);
        }
    };

    const handleReverseGeocode = async (idx: number, lat: number, lon: number) => {
        if (!lat || !lon) return;
        try {
            setIsLoading(true);
            const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}`);
            const data = await res.json();
            if (data && data.display_name) {
                const newLocs = attendanceLocations.map((loc, i) =>
                    i === idx ? { ...loc, address: data.display_name } : loc
                );
                setAttendanceLocations(newLocs);
                toast.success("Address fetched from coordinates!");
            }
        } catch (error) {
            console.error("Reverse geocoding error:", error);
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
            icon: <Moon className="size-4 text-indigo-500" />,
            hint: "EARLY / ON-TIME",
            hintClass: "bg-indigo-500/10 text-indigo-600 border-indigo-500/20",
        },
        {
            id: "lateThreshold",
            label: "Late Cutoff",
            description: "Mark as LATE after this time.",
            value: lateThreshold,
            onChange: setLateThreshold,
            icon: <AlertCircle className="size-4 text-amber-500" />,
            hint: "LATE",
            hintClass: "bg-amber-500/10 text-amber-600 border-amber-500/20",
        },
        {
            id: "halfDayThreshold",
            label: "Half Day Cutoff",
            description: "Mark as HALF DAY after this time.",
            value: halfDayThreshold,
            onChange: setHalfDayThreshold,
            icon: <Timer className="size-4 text-orange-500" />,
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
            icon: <Sun className="size-4 text-purple-500" />,
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
            icon: <Plus className="size-4 text-rose-500" />,
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
            icon: <Plus className="size-4 text-emerald-500" />,
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
                            <Clock className="size-4" />
                            Attendance Rules
                        </CardTitle>
                        <CardDescription className="text-base">
                            Define the thresholds for check-ins and overtime tracking.
                        </CardDescription>
                    </div>

                    <div className="grid gap-4">
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
                            <CalendarIcon className="size-4" />
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
                                                    const newHolidays = publicHolidays.map((h, i) =>
                                                        i === idx ? { ...h, name: e.target.value } : h
                                                    );
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
                                                    const newHolidays = publicHolidays.map((h, i) =>
                                                        i === idx ? { ...h, date: e.target.value } : h
                                                    );
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
                                            className="size-8 text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
                                            disabled={!isAdmin || isLoading}
                                        >
                                            <Trash2 className="size-4" />
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
                            <Plus className="size-4" />
                            Add Holiday
                        </Button>
                    </div>
                </div>

                {/* Locations Section */}
                <div className="lg:col-span-12 space-y-6 pt-4">
                    <div className="flex flex-col gap-1">
                        <CardTitle className="text-xl flex items-center gap-2">
                            <MapPin className="size-4" />
                            Attendance Locations
                        </CardTitle>
                        <CardDescription className="text-base">
                            Predefined addresses where users can check in. If a user is within the radius, the location name will be displayed in their record.
                        </CardDescription>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                        {attendanceLocations.map((loc, idx) => (
                            <div key={idx} className="p-4 rounded-xl border bg-card/30 backdrop-blur-md shadow-sm space-y-4 relative group animate-in fade-in zoom-in duration-300">
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => {
                                        setAttendanceLocations(attendanceLocations.filter((_, i) => i !== idx));
                                    }}
                                    className="absolute top-2 right-2 size-8 text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
                                    disabled={!isAdmin || isLoading}
                                >
                                    <Trash2 className="size-4" />
                                </Button>

                                <div className="space-y-3 pt-2">
                                    <div className="flex items-center justify-between gap-4">
                                        <div className="space-y-1 flex-1">
                                            <Label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Location Name</Label>
                                            <Input
                                                value={loc.name}
                                                onChange={(e) => {
                                                    const newLocs = attendanceLocations.map((l, i) =>
                                                        i === idx ? { ...l, name: e.target.value } : l
                                                    );
                                                    setAttendanceLocations(newLocs);
                                                }}
                                                placeholder="Main Office"
                                                className="h-8 font-bold bg-background/50 text-sm"
                                                disabled={!isAdmin || isLoading}
                                            />
                                        </div>
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            className="h-8 gap-2 text-[10px] font-bold uppercase tracking-tighter"
                                            onClick={() => window.open(`https://www.google.com/maps?q=${loc.latitude},${loc.longitude}`, '_blank')}
                                            disabled={!loc.latitude || !loc.longitude}
                                        >
                                            <MapPin className="size-3 text-rose-500" />
                                            View Map
                                        </Button>
                                    </div>

                                    <div className="space-y-1">
                                        <Label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Search & Set Address</Label>
                                        <div className="flex gap-2">
                                            <Input
                                                value={loc.address || ""}
                                                onChange={(e) => {
                                                    const newLocs = attendanceLocations.map((l, i) =>
                                                        i === idx ? { ...l, address: e.target.value } : l
                                                    );
                                                    setAttendanceLocations(newLocs);
                                                }}
                                                placeholder="Enter full address..."
                                                className="h-9 text-xs bg-background/50"
                                                disabled={!isAdmin || isLoading}
                                                onKeyDown={(e) => {
                                                    if (e.key === 'Enter') {
                                                        e.preventDefault();
                                                        handleSearchAddress(idx, loc.address);
                                                    }
                                                }}
                                            />
                                            <Button
                                                size="icon"
                                                variant="outline"
                                                className="size-9 shrink-0"
                                                onClick={() => handleSearchAddress(idx, loc.address)}
                                                disabled={!isAdmin || isLoading}
                                                title="Find Coordinates"
                                            >
                                                {isLoading ? <Loader2 className="size-4 animate-spin" /> : <MapPin className="size-4" />}
                                            </Button>
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-2 gap-2">
                                        <div className="space-y-1">
                                            <div className="flex items-center justify-between">
                                                <Label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Latitude</Label>
                                                <button
                                                    type="button"
                                                    onClick={() => handleReverseGeocode(idx, loc.latitude, loc.longitude)}
                                                    disabled={!isAdmin || isLoading || !loc.latitude || !loc.longitude}
                                                    className="text-[9px] font-bold uppercase tracking-tight text-primary hover:underline disabled:opacity-50 disabled:no-underline bg-transparent border-0 cursor-pointer p-0"
                                                >
                                                    Get Address
                                                </button>
                                            </div>
                                            <Input
                                                type="number"
                                                step="any"
                                                value={loc.latitude}
                                                onChange={(e) => {
                                                    const newLocs = attendanceLocations.map((l, i) =>
                                                        i === idx ? { ...l, latitude: parseFloat(e.target.value) || 0 } : l
                                                    );
                                                    setAttendanceLocations(newLocs);
                                                }}
                                                onBlur={() => {
                                                    if (loc.latitude && loc.longitude) {
                                                        handleReverseGeocode(idx, loc.latitude, loc.longitude);
                                                    }
                                                }}
                                                className="h-9 text-xs bg-background/50"
                                                disabled={!isAdmin || isLoading}
                                            />
                                        </div>
                                        <div className="space-y-1">
                                            <Label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Longitude</Label>
                                            <Input
                                                type="number"
                                                step="any"
                                                value={loc.longitude}
                                                onChange={(e) => {
                                                    const newLocs = attendanceLocations.map((l, i) =>
                                                        i === idx ? { ...l, longitude: parseFloat(e.target.value) || 0 } : l
                                                    );
                                                    setAttendanceLocations(newLocs);
                                                }}
                                                onBlur={() => {
                                                    if (loc.latitude && loc.longitude) {
                                                        handleReverseGeocode(idx, loc.latitude, loc.longitude);
                                                    }
                                                }}
                                                className="h-9 text-xs bg-background/50"
                                                disabled={!isAdmin || isLoading}
                                            />
                                        </div>
                                    </div>

                                    <div className="px-2 py-1.5 rounded-lg bg-primary/5 border border-primary/10">
                                        <p className="text-[10px] text-muted-foreground leading-tight italic">
                                            <span className="font-bold text-primary not-italic">Pro Tip:</span> Paste a Google Maps URL in the search box above to instantly set coordinates.
                                        </p>
                                    </div>

                                    <div className="space-y-1">
                                        <Label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Radius (meters)</Label>
                                        <Input
                                            type="number"
                                            value={loc.radius}
                                            onChange={(e) => {
                                                const newLocs = attendanceLocations.map((l, i) =>
                                                    i === idx ? { ...l, radius: parseFloat(e.target.value) || 0 } : l
                                                );
                                                setAttendanceLocations(newLocs);
                                            }}
                                            className="h-9 text-xs bg-background/50"
                                            disabled={!isAdmin || isLoading}
                                        />
                                    </div>
                                </div>
                            </div>
                        ))}

                        <button
                            onClick={() => {
                                setAttendanceLocations([...attendanceLocations, {
                                    id: `new-${Date.now()}`,
                                    name: "New Office",
                                    latitude: 0,
                                    longitude: 0,
                                    radius: 100
                                }]);
                            }}
                            className="p-4 rounded-xl border-2 border-dashed border-muted-foreground/10 hover:border-primary/50 hover:bg-primary/5 transition-all group flex flex-col items-center justify-center gap-2 min-h-[200px]"
                            disabled={!isAdmin || isLoading}
                        >
                            <div className="p-3 rounded-full bg-primary/10 group-hover:bg-primary/20 transition-colors">
                                <Plus className="size-6 text-primary" />
                            </div>
                            <span className="text-sm font-bold text-muted-foreground group-hover:text-primary transition-colors">Add New Location</span>
                        </button>
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
                        {isLoading ? <Loader2 className="size-5 animate-spin" /> : <Save className="size-5" />}
                        Apply All Changes
                    </Button>
                </div>
            )}

        </div>
    );
}
