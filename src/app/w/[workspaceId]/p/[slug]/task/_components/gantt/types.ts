/**
 * Gantt Chart Types
 * Main tasks only have id and name - dates are computed from subtasks
 */

export interface GanttSubtask {
    id: string;
    name: string;
    start: string; // YYYY-MM-DD format
    end: string;   // YYYY-MM-DD format
    status: string;
    // Dependencies - IDs of subtasks this depends on (must complete first)
    dependsOnIds: string[];
    // Computed at runtime
    isBlocked?: boolean;
    blockedByNames?: string[];
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

// Dependency line for visual rendering
export interface DependencyLine {
    fromId: string;
    toId: string;
    fromName: string;
    toName: string;
}

