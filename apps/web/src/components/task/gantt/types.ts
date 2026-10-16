/**
 * Legacy Gantt Chart Types
 * These types are used by the current implementation
 * For new features, consider using types-v2.ts
 */

// ============================================================================
// GRANULARITY & TIMELINE TYPES
// ============================================================================

export type TimelineGranularity = "days" | "weeks" | "months";

/** Subtask count per status, e.g. { TO_DO: 3, COMPLETED: 2 }. */
export type SubtaskStatusCounts = Partial<Record<string, number>>;

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
  taskSlug: string;
  start: string; // dd MMM yyyy format (e.g., "15 Apr 2026")
  end: string; // dd MMM yyyy format
  status: string;

  projectId: string;
  parentTaskId: string | null;
  description?: string | null;
  tagId?: string | null;
  tags?: { id: string; name: string }[];
  days?: number | null;

  createdById: string | null;
  assignee?: { id: string; surname: string };
  assigneeId?: string | null;
  assigneeRole?: string;

  position: number;
  updatedAt?: string; // dd MMM yyyy format
  dependsOnIds?: string[];
}

// ============================================================================
// TASK TYPES
// ============================================================================

export interface GanttTask {
  id: string;
  name: string;
  taskSlug: string;
  projectId: string;
  projectName?: string;
  projectColor?: string;
  status: string;
  start?: string; // Optional: DB provided
  end?: string; // Optional: DB provided
  subtasks?: GanttSubtask[]; // Optional/Undefined signals "not yet loaded"
  assignee?: { id: string; surname: string };
  assigneeId?: string | null;
  createdById: string | null;
  parentTaskId: string | null;
  updatedAt?: string;
  subtaskCount?: number;
  /** Per-status subtask counts from the API, matching any active filters. */
  subtaskStatusCounts?: SubtaskStatusCounts;
  hasMoreSubtasks?: boolean;
  subtaskCursor?: any;
  tags?: { id: string; name: string }[];
}

// ============================================================================
// COMPUTED TYPES
// ============================================================================

export interface ComputedTaskDates {
  start: Date | null;
  end: Date | null;
}
