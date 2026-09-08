import { differenceInDays, addDays, subDays, startOfDay } from "date-fns";
import { Task } from "../types";

export type TimelineGranularity = 'days' | 'weeks' | 'months';

export interface ComputedTaskDates {
    start: Date | null;
    end: Date | null;
}

export function parseDate(dateStr: string | null | undefined): Date | null {
    if (!dateStr) return null;
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return null;
    return date;
}

export function getDaysBetween(start: Date, end: Date): number {
    const startNorm = startOfDay(start);
    const endNorm = startOfDay(end);
    return Math.round((endNorm.getTime() - startNorm.getTime()) / (1000 * 60 * 60 * 24));
}

export function computeTaskDates(task: Task, allTasks: Task[] = []): ComputedTaskDates {
    let minStart = parseDate(task.startDate);
    let maxEnd = parseDate(task.dueDate);

    // Find children
    const subtasks = allTasks.filter(t => t.parentTaskId === task.id);
    if (subtasks && subtasks.length > 0) {
        for (const subtask of subtasks) {
            const start = parseDate(subtask.startDate);
            const end = parseDate(subtask.dueDate);

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

export function calculateTimelineRange(tasks: Task[]): { start: Date; end: Date } {
    const today = startOfDay(new Date());
    let minDate = new Date(today);
    let maxDate = new Date(today);
    
    // Default 30 days ahead for mobile performance
    maxDate.setDate(maxDate.getDate() + 30); 

    for (const task of tasks) {
        const { start, end } = computeTaskDates(task, tasks);
        if (start && start < minDate) minDate = new Date(start);
        if (end && end > maxDate) maxDate = new Date(end);
    }

    if (today < minDate) minDate = new Date(today);
    if (today > maxDate) maxDate = new Date(today);

    // Padding for mobile (less than web to save horizontal render space)
    const paddingBefore = 4;
    const paddingAfter = 7; 

    minDate = subDays(minDate, paddingBefore);
    maxDate = addDays(maxDate, paddingAfter);

    return { start: minDate, end: maxDate };
}

/**
 * Progress % for a single task/subtask — ported 1:1 from web's
 * calculateProgress in apps/web/src/components/task/gantt/transform-tasks.ts
 * so bars read the same on both platforms. Not a DB column; both clients
 * derive it from status + elapsed time.
 */
export function calculateProgress(status: string, start: Date | null, end: Date | null): number {
    if (status === "COMPLETED") return 100;
    if (status === "REVIEW") return 80;
    if (status === "TO_DO" || status === "HOLD" || status === "CANCELLED") return 0;

    if (status === "IN_PROGRESS") {
        if (!start || !end) return 10;
        const today = startOfDay(new Date());
        const total = end.getTime() - start.getTime();
        if (total <= 0) return 60;
        const elapsed = today.getTime() - start.getTime();
        const rawProgress = Math.max(0, (elapsed / total) * 60);
        return Math.min(60, Math.round(rawProgress));
    }

    return 0;
}

/**
 * Weighted rollup of subtask progress onto a parent task, by duration —
 * mirrors web's parentProgress calc in transform-tasks.ts.
 */
export function calculateParentProgress(
    subtaskProgress: { progress: number; days: number }[]
): number {
    if (subtaskProgress.length === 0) return 0;
    let totalWeight = 0;
    let weightedSum = 0;
    for (const s of subtaskProgress) {
        const weight = s.days || 1;
        weightedSum += s.progress * weight;
        totalWeight += weight;
    }
    return totalWeight > 0 ? Math.round(weightedSum / totalWeight) : 0;
}

/**
 * Delay/overdue calc for a bar's end date — ported from web's
 * draggable-subtask-bar.tsx isDelayed/delayWidthPercent.
 */
export function calculateDelay(
    end: Date | null,
    status: string,
    totalDays: number
): { isDelayed: boolean; delayDays: number; delayWidthPercent: number } {
    const isSettled = status === "COMPLETED" || status === "CANCELLED" || status === "HOLD";
    if (!end || isSettled) return { isDelayed: false, delayDays: 0, delayWidthPercent: 0 };

    const today = startOfDay(new Date());
    const taskEnd = startOfDay(end);
    const isDelayed = taskEnd < today;
    if (!isDelayed) return { isDelayed: false, delayDays: 0, delayWidthPercent: 0 };

    const delayDays = getDaysBetween(taskEnd, today);
    return {
        isDelayed: true,
        delayDays,
        delayWidthPercent: (delayDays / totalDays) * 100,
    };
}

/**
 * Formats a date for the fields PATCH API (YYYY-MM-DDTHH:mm) — ported from
 * web's formatDateForAPI in apps/web/src/components/task/gantt/utils.ts so
 * mobile drag/resize sends the same payload shape.
 */
export function formatDateForAPI(date: Date, type: 'start' | 'end'): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    let hours = date.getHours();
    let minutes = date.getMinutes();
    if (type === 'end' && hours === 0 && minutes === 0) {
        hours = 23;
        minutes = 59;
    }
    return `${year}-${month}-${day}T${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

export function calculateBarPosition(
    barStart: Date,
    barEnd: Date,
    timelineStart: Date,
    totalDays: number
): { left: number; width: number } {
    const normalizedStart = startOfDay(barStart);
    const normalizedEnd = startOfDay(barEnd);
    const normalizedTimelineStart = startOfDay(timelineStart);

    const startOffset = getDaysBetween(normalizedTimelineStart, normalizedStart);
    // Add 1 for inclusive end day
    const duration = getDaysBetween(normalizedStart, normalizedEnd) + 1;

    const left = (startOffset / totalDays) * 100;
    const width = (duration / totalDays) * 100;

    return {
        left: Math.max(0, left),
        width: Math.max(1, Math.min(width, 100 - left))
    };
}
