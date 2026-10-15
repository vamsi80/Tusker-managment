import { cn } from "@/lib/utils";

const TONE_CLASS = {
    success: "text-success",
    warning: "text-warning",
    danger: "text-destructive",
    info: "text-info",
    leave: "text-leave",
    "half-day": "text-half-day",
    muted: "text-muted-foreground",
} as const;

export type StatusTone = keyof typeof TONE_CLASS;

/** Status as the design draws it: a coloured dot followed by coloured text. */
export function StatusDot({ tone, label, className }: { tone: StatusTone; label: string; className?: string }) {
    return (
        <span className={cn("inline-flex items-center gap-2 text-sm font-medium whitespace-nowrap", TONE_CLASS[tone], className)}>
            <span className="size-2 shrink-0 rounded-full bg-current" />
            {label}
        </span>
    );
}

/** Attendance statuses (and the Sunday placeholder) mapped to their tone and label. */
export const ATTENDANCE_STATUS: Record<string, { tone: StatusTone; label: string }> = {
    PRESENT: { tone: "success", label: "On Time" },
    LATE: { tone: "warning", label: "Late" },
    HALF_DAY: { tone: "half-day", label: "Half Day" },
    ON_LEAVE: { tone: "leave", label: "On Leave" },
    ABSENT: { tone: "danger", label: "Absent" },
};
