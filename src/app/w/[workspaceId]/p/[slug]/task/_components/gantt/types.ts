/**
 * Gantt Chart Types
 * Main tasks only have id and name - dates are computed from subtasks
 */

export interface GanttSubtask {
    id: string;
    name: string;
    start: string; // YYYY-MM-DD format
    end: string;   // YYYY-MM-DD format
}

export interface GanttTask {
    id: string;
    name: string;
    subtasks: GanttSubtask[];
}

export interface ComputedTaskDates {
    start: Date | null;
    end: Date | null;
}

export type TimelineGranularity = 'days' | 'weeks' | 'months';

export interface TimelineConfig {
    startDate: Date;
    endDate: Date;
    totalDays: number;
    granularity: TimelineGranularity;
}
