import { GanttTask, GanttSubtask, ComputedTaskDates, TimelineGranularity, type SubtaskStatusCounts } from "./types";
import { parse } from "date-fns";
import { transformToGanttSubtasks } from "./transform-tasks";
import { APP_DATE_FORMAT, formatIST } from "@/lib/utils";

/**
 * Status color mapping for Gantt bars
 */
export const GANTT_STATUS_COLORS: Record<string, string> = {
    'TO_DO': '#94A3B8',
    'IN_PROGRESS': '#3B82F6',
    'CANCELLED': '#EF4444',
    'REVIEW': '#8B5CF6',
    'HOLD': '#F59E0B',
    'COMPLETED': '#22C55E'
};

/**
 * Get color for a specific status
 */
export function getStatusColor(status: string, defaultColor?: string): string {
    return GANTT_STATUS_COLORS[status] || defaultColor || GANTT_STATUS_COLORS['TO_DO'];
}

/* ------------------------------------------------------------------------- *
 * Status counts, progress and aggregate status
 *
 * Parent rows arrive without their subtasks, carrying per-status counts from
 * the API instead (filtered the same way an expansion would be). Everything a
 * parent row shows — progress and bar colour — is derived from counts, so a
 * collapsed row and an expanded one agree.
 * ------------------------------------------------------------------------- */

export function countStatuses(subtasks: Pick<GanttSubtask, "status">[]): SubtaskStatusCounts {
    const counts: SubtaskStatusCounts = {};
    for (const s of subtasks) {
        const status = s.status || "TO_DO";
        counts[status] = (counts[status] ?? 0) + 1;
    }
    return counts;
}

/**
 * The counts behind a parent row: live from its loaded subtasks when all of
 * them are loaded, otherwise the API's counts (kept current by applySubtaskPatch).
 */
export function statusCountsOf(task: Pick<GanttTask, "subtasks" | "hasMoreSubtasks" | "subtaskStatusCounts">): SubtaskStatusCounts {
    if (task.subtasks && !task.hasMoreSubtasks) return countStatuses(task.subtasks);
    return task.subtaskStatusCounts ?? (task.subtasks ? countStatuses(task.subtasks) : {});
}

/** Share of subtasks completed, as a whole percent. Cancelled work is not counted as remaining. */
export function parentProgress(counts: SubtaskStatusCounts): number {
    const total = Object.values(counts).reduce<number>((sum, n) => sum + (n ?? 0), 0) - (counts.CANCELLED ?? 0);
    return total > 0 ? Math.round(((counts.COMPLETED ?? 0) / total) * 100) : 0;
}

/** The status a parent's bar takes from its subtasks. */
export function aggregateStatusFromCounts(counts: SubtaskStatusCounts): string {
    const entries = Object.entries(counts).filter(([, n]) => (n ?? 0) > 0) as [string, number][];
    const total = entries.reduce((sum, [, n]) => sum + n, 0);
    if (total === 0) return 'TO_DO';
    const n = (status: string) => counts[status] ?? 0;

    if (n('COMPLETED') === total) return 'COMPLETED';
    if (n('IN_PROGRESS') > 0 || n('REVIEW') > 0) return 'IN_PROGRESS';
    if (n('COMPLETED') > 0 && n('TO_DO') > 0) return 'IN_PROGRESS';
    if (n('CANCELLED') === total) return 'CANCELLED';
    if (n('HOLD') === total) return 'HOLD';
    return entries.sort((a, b) => b[1] - a[1])[0][0];
}

/** Determine aggregate status of a task based on its subtasks. */
export function getAggregateStatus(subtasks: GanttSubtask[]): string {
    return aggregateStatusFromCounts(countStatuses(subtasks || []));
}

/**
 * A subtask's progress estimate from its status: Completed 100, Review 80, In
 * Progress up to 60 by how much of its date range has passed, otherwise 0.
 * Derived at render time so a status change shows immediately.
 */
export function subtaskProgress(subtask: Pick<GanttSubtask, "status" | "start" | "end">, today: Date = new Date()): number {
    switch (subtask.status) {
        case 'COMPLETED': return 100;
        case 'REVIEW': return 80;
        case 'IN_PROGRESS': {
            const start = parseGanttDate(subtask.start);
            const end = parseGanttDate(subtask.end);
            if (!start || !end) return 10;
            const total = end.getTime() - start.getTime();
            if (total <= 0) return 60;
            const midnight = new Date(today);
            midnight.setHours(0, 0, 0, 0);
            const elapsed = midnight.getTime() - start.getTime();
            return Math.min(60, Math.round(Math.max(0, (elapsed / total) * 60)));
        }
        default: return 0;
    }
}

/**
 * Merge a change into a subtask (or a parent row) in Gantt state. A status
 * change also moves one count between statuses, so a parent's progress and
 * colour stay right even when not all of its subtasks are loaded.
 */
export function applySubtaskPatch(tasks: GanttTask[], id: string, data: Partial<any>): GanttTask[] {
    return tasks.map((task) => {
        if (task.id === id) return { ...task, ...data };

        const existing = task.subtasks?.find((s) => s.id === id);
        if (!existing) return task;

        let counts = task.subtaskStatusCounts;
        const from = existing.status || "TO_DO";
        const to = data.status;
        if (counts && to && to !== from) {
            counts = { ...counts, [from]: Math.max(0, (counts[from] ?? 0) - 1), [to]: (counts[to] ?? 0) + 1 };
        }
        return {
            ...task,
            subtaskStatusCounts: counts,
            subtasks: task.subtasks!.map((s) => (s.id === id ? { ...s, ...data } : s)),
        };
    });
}

/** Remove a deleted subtask from its parent, taking it out of the counts too. */
export function removeSubtask(tasks: GanttTask[], record: { id: string; parentTaskId?: string | null; status?: string | null }): GanttTask[] {
    return tasks.map((task) => {
        if (task.id !== record.parentTaskId) return task;
        const status = task.subtasks?.find((s) => s.id === record.id)?.status ?? record.status ?? null;
        const counts = task.subtaskStatusCounts;
        return {
            ...task,
            subtasks: task.subtasks?.filter((s) => s.id !== record.id),
            subtaskCount: Math.max(0, (task.subtaskCount || 0) - 1),
            subtaskStatusCounts: counts && status
                ? { ...counts, [status]: Math.max(0, (counts[status] ?? 0) - 1) }
                : counts,
        };
    });
}

/**
 * Add a newly created subtask (raw API row) under its parent. Idempotent: the
 * creator's own realtime echo of the same subtask is ignored, so counts only
 * move once.
 */
export function appendSubtask(tasks: GanttTask[], raw: any): GanttTask[] {
    if (!raw?.id || !raw.parentTaskId) return tasks;
    return tasks.map((task) => {
        if (task.id !== raw.parentTaskId) return task;
        if (task.subtasks?.some((s) => s.id === raw.id)) return task;

        const [subtask] = transformToGanttSubtasks([raw]);
        const status = subtask.status || "TO_DO";
        return {
            ...task,
            subtasks: task.subtasks ? [...task.subtasks, subtask] : task.subtasks,
            subtaskCount: (task.subtaskCount || 0) + 1,
            subtaskStatusCounts: task.subtaskStatusCounts
                ? { ...task.subtaskStatusCounts, [status]: (task.subtaskStatusCounts[status] ?? 0) + 1 }
                : task.subtaskStatusCounts,
        };
    });
}

/**
 * Get current date (midnight) for today comparisons
 * Uses local browser time which should be IST for users in India
 */
export function getIndianDate(): Date {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return today;
}

/**
 * Parse ISO date string to Date object safely
 */
export function parseDate(dateStr: string | null | undefined): Date | null {
    if (!dateStr) return null;
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return null;
    return date;
}

/**
 * Parses a date string in the project's standard Gantt format (e.g., "15 Apr 2026")
 */
export function parseGanttDate(dateStr: string | null | undefined): Date | null {
    if (!dateStr || dateStr === "-") return null;
    try {
        const date = parse(dateStr, APP_DATE_FORMAT, new Date());
        return isNaN(date.getTime()) ? null : date;
    } catch (e) {
        console.error(`[parseGanttDate] Failed to parse: ${dateStr}`, e);
        return null;
    }
}
/**
 * Formats a date for the API (YYYY-MM-DDTHH:mm)
 * If the time component is not set (00:00), it defaults to start of day (00:00) for starts 
 * and end of day (23:59) for ends.
 */
export function formatDateForAPI(date: Date, type: 'start' | 'end'): string {
    const d = new Date(date);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    
    let hours = d.getHours();
    let minutes = d.getMinutes();

    if (type === 'end' && hours === 0 && minutes === 0) {
        hours = 23;
        minutes = 59;
    }
    // Start dates already default to 00:00 if hours/mins are 0

    return `${year}-${month}-${day}T${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

/**
 * Compute task start/end dates from task metadata or its subtasks
 * 1. Priority: task.start / task.end (Direct DB values)
 * 2. Fallback: min(subtask.start) / max(subtask.end)
 */
export function computeTaskDates(task: GanttTask): ComputedTaskDates {
    // Attempt to use direct values first
    let minStart = task.start ? parseDate(task.start) : null;
    let maxEnd = task.end ? parseDate(task.end) : null;

    // If subtasks exist, they can expand the boundary
    if (task.subtasks && task.subtasks.length > 0) {
        for (const subtask of task.subtasks) {
            const start = parseDate(subtask.start);
            const end = parseDate(subtask.end);

            if (start && (!minStart || start < minStart)) {
                minStart = start;
            }
            if (end && (!maxEnd || end > maxEnd)) {
                maxEnd = end;
            }
        }
    }

    return { start: minStart, end: maxEnd };
}

/**
 * Calculate the timeline range from all tasks
 */
export function calculateTimelineRange(tasks: GanttTask[]): { start: Date; end: Date } {
    const today = getIndianDate();
    let minDate = new Date(today);
    let maxDate = new Date(today);
    maxDate.setDate(maxDate.getDate() + 60); // Default 60 days ahead

    for (const task of tasks) {
        const { start, end } = computeTaskDates(task);
        if (start && start < minDate) minDate = new Date(start);
        if (end && end > maxDate) maxDate = new Date(end);
    }

    // Ensure today is always within the range
    if (today < minDate) minDate = new Date(today);
    if (today > maxDate) maxDate = new Date(today);

    // Add padding - more padding before today, less after
    const paddingBefore = 7; // 1 week before
    const paddingAfter = 14; // 2 weeks after

    minDate.setDate(minDate.getDate() - paddingBefore);
    maxDate.setDate(maxDate.getDate() + paddingAfter);

    return { start: minDate, end: maxDate };
}

/**
 * Get days between two dates
 */
export function getDaysBetween(start: Date, end: Date): number {
    // Normalize both dates to midnight for accurate day counting
    const startNorm = new Date(start);
    startNorm.setHours(0, 0, 0, 0);
    const endNorm = new Date(end);
    endNorm.setHours(0, 0, 0, 0);

    const diffTime = endNorm.getTime() - startNorm.getTime();
    return Math.round(diffTime / (1000 * 60 * 60 * 24));
}

/**
 * Calculate bar position and width as percentages
 * Bars span from the left edge of the start day to the right edge of the end day
 */
export function calculateBarPosition(
    barStart: Date,
    barEnd: Date,
    timelineStart: Date,
    totalDays: number
): { left: number; width: number } {
    // Normalize dates to midnight for accurate day calculations
    const normalizedStart = new Date(barStart);
    normalizedStart.setHours(0, 0, 0, 0);
    const normalizedEnd = new Date(barEnd);
    normalizedEnd.setHours(0, 0, 0, 0);
    const normalizedTimelineStart = new Date(timelineStart);
    normalizedTimelineStart.setHours(0, 0, 0, 0);

    // Calculate the offset from timeline start (in days)
    const startOffset = getDaysBetween(normalizedTimelineStart, normalizedStart);

    // Calculate duration: number of days from start to end (inclusive)
    // Adding 1 because if start=end, it's still 1 day
    const duration = getDaysBetween(normalizedStart, normalizedEnd) + 1;

    // Convert to percentages
    // The bar should start at the left edge of the start day column
    // and end at the right edge of the end day column
    const left = (startOffset / totalDays) * 100;
    const width = (duration / totalDays) * 100;

    return {
        left: Math.max(0, left),
        width: Math.max(1, Math.min(width, 100 - left))
    };
}

/**
 * Generate timeline columns based on granularity
 */
export function generateTimelineColumns(
    start: Date,
    end: Date,
    granularity: TimelineGranularity
): { date: Date; label: string; isToday: boolean }[] {
    const columns: { date: Date; label: string; isToday: boolean }[] = [];
    const current = new Date(start);
    const today = getIndianDate(); // Use IST for today

    while (current <= end) {
        const isToday = current.toDateString() === today.toDateString();

        let label: string;
        if (granularity === 'days') {
            label = current.getDate().toString();
        } else if (granularity === 'weeks') {
            label = `W${getWeekNumber(current)}`;
        } else {
            label = current.toLocaleDateString('en-US', { month: 'short' });
        }

        columns.push({
            date: new Date(current),
            label,
            isToday
        });

        // Increment based on granularity
        if (granularity === 'days') {
            current.setDate(current.getDate() + 1);
        } else if (granularity === 'weeks') {
            current.setDate(current.getDate() + 7);
        } else {
            current.setMonth(current.getMonth() + 1);
        }
    }

    return columns;
}

/**
 * Get week number of the year
 */
function getWeekNumber(date: Date): number {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
}

/**
 * Format date for display
 */
export function formatDate(date: Date): string {
    return formatIST(date);
}

/**
 * Format date range for display
 */
export function formatDateRange(start: Date | null, end: Date | null): string {
    if (!start || !end) return 'No dates';
    return `${formatDate(start)} — ${formatDate(end)}`;
}

/**
 * Validate dependencies for subtasks within a task
 * Returns subtasks with isBlocked and blockedByNames populated
 */
// export function validateDependencies(subtasks: GanttSubtask[]): GanttSubtask[] {
//     const subtaskMap = new Map<string, GanttSubtask>();
//     subtasks.forEach(st => subtaskMap.set(st.id, st));

//     return subtasks.map(subtask => {
//         if (!subtask.dependsOnIds || subtask.dependsOnIds.length === 0) {
//             return { ...subtask, isBlocked: false, blockedByNames: [] };
//         }

//         // Check if all dependencies are COMPLETED
//         const blockedBy: string[] = [];
//         for (const depId of subtask.dependsOnIds) {
//             const parent = subtaskMap.get(depId);
//             if (parent && parent.status !== 'COMPLETED') {
//                 blockedBy.push(parent.name);
//             }
//         }

//         return {
//             ...subtask,
//             isBlocked: blockedBy.length > 0,
//             blockedByNames: blockedBy
//         };
//     });
// }

/**
 * Extract dependency lines for visual rendering
 */
// export function getDependencyLines(subtasks: GanttSubtask[]): DependencyLine[] {
//     const subtaskMap = new Map<string, GanttSubtask>();
//     subtasks.forEach(st => subtaskMap.set(st.id, st));

//     const lines: DependencyLine[] = [];

//     for (const subtask of subtasks) {
//         if (subtask.dependsOnIds && subtask.dependsOnIds.length > 0) {
//             for (const depId of subtask.dependsOnIds) {
//                 const parent = subtaskMap.get(depId);
//                 if (parent) {
//                     lines.push({
//                         fromId: parent.id,
//                         toId: subtask.id,
//                         fromName: parent.name,
//                         toName: subtask.name
//                     });
//                 }
//             }
//         }
//     }
//     return lines;
// }

/**
 * Converts a Gantt date display string (e.g., "15 Apr 2026") to an ISO 8601 string for the API
 */
export function ganttDateToISO(dateStr: string | null | undefined): string | undefined {
    const d = parseGanttDate(dateStr);
    return d ? d.toISOString() : undefined;
}
