/**
 * Legacy Gantt Chart Types
 * These types are used by the current implementation
 * For new features, consider using types-v2.ts
 */

// ============================================================================
// GRANULARITY & TIMELINE TYPES
// ============================================================================

export type TimelineGranularity = "days" | "weeks" | "months";

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
  days?: number | null;

  createdById: string | null;
  assignee?: { id: string; surname: string };
  assigneeId?: string | null;
  assigneeRole?: string;

  position: number;
  updatedAt?: string; // dd MMM yyyy format
  dependsOnIds?: string[];
  progress: number;
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
  progress: number;
  subtaskCount?: number;
  hasMoreSubtasks?: boolean;
  subtaskCursor?: any;
}

// ============================================================================
// COMPUTED TYPES
// ============================================================================

export interface ComputedTaskDates {
  start: Date | null;
  end: Date | null;
}
