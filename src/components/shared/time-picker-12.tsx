"use client";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

/**
 * 12-hour hour/minute/AM-PM picker over a 24-hour "HH:MM" value.
 * Extracted from the attendance settings panel so the departments page uses the
 * exact same control for shift schedules.
 */

export function to12h(time24: string) {
    const [h, m] = time24.split(":").map(Number);
    const period = h >= 12 ? "PM" : "AM";
    const hour12 = h % 12 === 0 ? 12 : h % 12;
    return { hour12: String(hour12), minute: String(m).padStart(2, "0"), period };
}

export function to24h(hour12: string, minute: string, period: string): string {
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

export function TimePicker12({ value, onChange, disabled }: TimePicker12Props) {
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
