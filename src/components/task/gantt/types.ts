/**
 * Legacy Gantt Chart Types
 * These types are used by the current implementation
 * For new features, consider using types-v2.ts
 */

// ============================================================================
// GRANULARITY & TIMELINE TYPES
// ============================================================================

export type TimelineGranularity = 'days' | 'weeks' | 'months';

export interface TimelineConfig {
    start: Date;
    end: Date;
    granularity: TimelineGranularity;
}

// ============================================================================
// SUBTASK TYPES
// ============================================================================

export interface GanttSubtask {
    id: string;
    name: string;
    start: string; // YYYY-MM-DD format
    end: string;   // YYYY-MM-DD format
    status: string;
    dependsOnIds: string[];
    isBlocked?: boolean;
    blockedByNames?: string[];
    assignee?: { id: string; name: string; image?: string | null };
}

// ============================================================================
// TASK TYPES
// ============================================================================

export interface GanttTask {
    id: string;
    name: string;
    projectId?: string;
    projectName?: string;
    projectColor?: string;
    subtasks: GanttSubtask[];
    assignee?: { id: string; name: string; image?: string | null };
}

// ============================================================================
// COMPUTED TYPES
// ============================================================================

export interface ComputedTaskDates {
    start: Date | null;
    end: Date | null;
}

// ============================================================================
// DEPENDENCY TYPES
// ============================================================================

export interface DependencyLine {
    fromId: string;
    toId: string;
    fromName: string;
    toName: string;
}
