/**
 * Delay Colors Utility
 * 
 * Provides consistent colors and text for task deadlines/delays 
 * across Kanban, List, and Gantt views.
 */

export interface DelayColors {
    color: string;
    bgColor: string;
    dotColor: string;
    borderColor: string;
}

/**
 * Get color classes for a task based on its deadline status
 */
export function getDelayColors(remainingDays: number | null, status: string | null | undefined): DelayColors {
    // Terminal statuses
    if (status === "COMPLETED") {
        return {
            color: "text-emerald-600 dark:text-emerald-400",
            bgColor: "bg-emerald-500/10",
            dotColor: "bg-emerald-500",
            borderColor: "border-emerald-500/20",
        };
    }
    if (status === "CANCELLED") {
        return {
            color: "text-muted-foreground",
            bgColor: "bg-muted/50",
            dotColor: "bg-slate-400",
            borderColor: "border-slate-400/20",
        };
    }

    // No deadline
    if (remainingDays === null) {
        return {
            color: "text-muted-foreground",
            bgColor: "bg-muted/30",
            dotColor: "bg-gray-300",
            borderColor: "border-gray-300/20",
        };
    }

    // Overdue or Critical (<= 7 days)
    if (remainingDays < 0 || remainingDays <= 7) {
        return {
            color: "text-rose-600 dark:text-rose-400",
            bgColor: "bg-rose-500/10",
            dotColor: "bg-rose-500",
            borderColor: "border-rose-500/20",
        };
    }

    // Warning (8-10 days)
    if (remainingDays <= 10) {
        return {
            color: "text-amber-600 dark:text-amber-400",
            bgColor: "bg-amber-500/10",
            dotColor: "bg-amber-500",
            borderColor: "border-amber-500/20",
        };
    }

    // Healthy (> 10 days)
    return {
        color: "text-emerald-600 dark:text-emerald-400",
        bgColor: "bg-emerald-500/10",
        dotColor: "bg-emerald-500",
        borderColor: "border-emerald-500/20",
    };
}

/**
 * Get standardized text for task deadlines
 */
export function getDelayText(remainingDays: number | null, status: string | null | undefined): string {
    if (status === "COMPLETED") return "Finished";
    if (status === "CANCELLED") return "Cancelled";
    if (remainingDays === null) return "No deadline";

    if (remainingDays > 0) {
        return `${remainingDays}d left`;
    }
    if (remainingDays === 0) {
        return "Due today";
    }
    return `${Math.abs(remainingDays)}d delayed`;
}
