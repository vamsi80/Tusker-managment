export interface DelayColors {
    color: string;
    bgColor: string;
    dotColor: string;
    borderColor: string;
    dotVariant: "solid" | "ring" | "blink";
}

export function getDelayColors(
    remainingDays: number | null,
    status: string | null | undefined
): DelayColors {
    if (status === "COMPLETED") {
        return {
            color: "text-emerald-600 dark:text-emerald-400",
            bgColor: "bg-emerald-500/10",
            dotColor: "bg-emerald-500",
            borderColor: "border-emerald-500/20",
            dotVariant: "solid",
        };
    }
    if (status === "CANCELLED") {
        return {
            color: "text-muted-foreground",
            bgColor: "bg-muted/50",
            dotColor: "bg-slate-400",
            borderColor: "border-slate-400/20",
            dotVariant: "solid",
        };
    }
    if (remainingDays === null) {
        return {
            color: "text-muted-foreground",
            bgColor: "bg-muted/30",
            dotColor: "bg-gray-300",
            borderColor: "border-gray-300/20",
            dotVariant: "solid",
        };
    }
    if (remainingDays < 0) {
        return {
            color: "text-rose-600 dark:text-rose-400",
            bgColor: "bg-rose-500/10",
            dotColor: "bg-rose-500",
            borderColor: "border-rose-500/20",
            dotVariant: "blink",
        };
    }
    if (remainingDays === 0) {
        return {
            color: "text-rose-600 dark:text-rose-400",
            bgColor: "bg-rose-500/10",
            dotColor: "bg-rose-500",
            borderColor: "border-rose-500/20",
            dotVariant: "solid",
        };
    }
    if (remainingDays > 20) {
        return {
            color: "text-emerald-600 dark:text-emerald-400",
            bgColor: "bg-emerald-500/10",
            dotColor: "bg-emerald-500",
            borderColor: "border-emerald-500/20",
            dotVariant: "ring",
        };
    }
    if (remainingDays > 10) {
        return {
            color: "text-orange-600 dark:text-orange-400",
            bgColor: "bg-orange-500/10",
            dotColor: "bg-orange-500",
            borderColor: "border-orange-500/20",
            dotVariant: "solid",
        };
    }
    return {
        color: "text-rose-600 dark:text-rose-400",
        bgColor: "bg-rose-500/10",
        dotColor: "bg-rose-500",
        borderColor: "border-rose-500/20",
        dotVariant: "ring",
    };
}

export function getDelayText(
    remainingDays: number | null,
    status: string | null | undefined
): string {
    if (status === "COMPLETED") return "Finished";
    if (status === "CANCELLED") return "Cancelled";
    if (remainingDays === null) return "No deadline";
    if (remainingDays > 0) return `${remainingDays}d left`;
    if (remainingDays === 0) return "Due today";
    return `${Math.abs(remainingDays)}d delayed`;
}
