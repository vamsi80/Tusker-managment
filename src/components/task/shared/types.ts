/**
 * Shared Types for Task Components
 * 
 * This file contains all shared TypeScript types and interfaces
 * used across task components (List, Kanban, Gantt, and shared components).
 */
import { WorkspaceTaskType } from "@/data/task";
import { SubTaskType } from "@/data/task/list/get-subtasks";

// ============================================================================
// FILTER TYPES
// ============================================================================

/**
 * Task status enum
 */
export type TaskStatus =
    | "TO_DO"
    | "IN_PROGRESS"
    | "REVIEW"
    | "HOLD"
    | "COMPLETED"
    | "CANCELLED";

/**
 * Check if a value is a valid TaskStatus
 */
export function isTaskStatus(value: unknown): value is TaskStatus {
    return typeof value === "string" && [
        "TO_DO",
        "IN_PROGRESS",
        "REVIEW",
        "HOLD",
        "COMPLETED",
        "CANCELLED"
    ].includes(value);
}

/**
 * View level - determines which filters are available
 */
export type ViewLevel = "project" | "workspace";

/**
 * View type - determines which filters are shown
 */
export type ViewType = "dashboard" | "list" | "kanban" | "gantt";

/**
 * Check if a value is a valid ViewType
 */
export function isViewType(value: unknown): value is ViewType {
    return typeof value === "string" && [
        "dashboard",
        "list",
        "kanban",
        "gantt"
    ].includes(value);
}

/**
 * Task filters interface
 * Used for filtering tasks across all views
 */
export interface TaskFilters {
    /** Project ID filter (workspace-level only) */
    projectId?: string;

    /** Status filter */
    status?: TaskStatus;

    /** Assignee user ID filter */
    assigneeId?: string;

    /** Start date filter (from) */
    startDate?: Date | string;

    /** End date filter (to) */
    endDate?: Date | string;

    /** Tag ID filter (alias for tag) */
    tagId?: string;

    /** Search query */
    search?: string;

    /** Parent task ID filter (Kanban-specific) */
    parentTaskId?: string;
}

/**
 * Filter configuration - determines which filters to show
 */
export interface FilterConfig {
    showProjectFilter: boolean;
    showStatusFilter: boolean;
    showAssigneeFilter: boolean;
    showDateRangeFilter: boolean;
    showTagFilter: boolean;
    showSearch: boolean;
    showParentTaskFilter?: boolean;
}

// ============================================================================
// DROPDOWN OPTIONS
// ============================================================================

/**
 * Project option for dropdown
 */
export interface ProjectOption {
    id: string;
    name: string;
    slug?: string;
    color?: string;
    memberIds?: string[];
}

/**
 * Member option for dropdown
 */
export interface MemberOption {
    id: string;
    name: string;
    surname?: string;
    email?: string;
    avatar?: string;
}

/**
 * Status option for dropdown
 */
export interface StatusOption {
    value: TaskStatus;
    label: string;
    color: string;
    bgColor: string;
    borderColor: string;
}

/**
 * Tag option for dropdown
 */
export interface TagOption {
    id: string;
    name: string;
}

// ============================================================================
// COMPONENT PROPS
// ============================================================================

/**
 * Base props for view components
 */
export interface BaseViewProps {
    workspaceId: string;
    projectId?: string;
}

/**
 * Props for filter components
 */
export interface FilterComponentProps {
    level: ViewLevel;
    view: ViewType;
    filters: TaskFilters;
    projects?: ProjectOption[];
    members?: MemberOption[];
    onFilterChange: (filters: TaskFilters) => void;
    onClearFilters: () => void;
}

/**
 * Props for search component
 */
export interface SearchComponentProps {
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
    debounceMs?: number;
}

/**
 * Props for view switcher component
 */
export interface ViewSwitcherProps {
    currentView: ViewType;
    onViewChange: (view: ViewType) => void;
    availableViews?: ViewType[];
}

// ============================================================================
// UTILITY TYPES
// ============================================================================

/**
 * Date range filter
 */
export interface DateRange {
    from?: Date | string;
    to?: Date | string;
}

/**
 * Active filter badge
 */
export interface ActiveFilter {
    key: keyof TaskFilters;
    label: string;
    value: string;
}

/**
 * Filter change event
 */
export type FilterChangeHandler = (filters: Partial<TaskFilters>) => void;

/**
 * Filter clear event
 */
export type FilterClearHandler = () => void;

// ============================================================================
// FILTER CONFIGURATIONS
// ============================================================================

/**
 * Get filter configuration based on view and level
 */
export function getFilterConfig(view: ViewType, level: ViewLevel): FilterConfig {
    const configs: Record<ViewType, FilterConfig> = {
        dashboard: {
            showProjectFilter: level === "workspace",
            showStatusFilter: false,
            showAssigneeFilter: false,
            showDateRangeFilter: false,
            showTagFilter: false,
            showSearch: true,
        },
        list: {
            showProjectFilter: level === "workspace",
            showStatusFilter: true,
            showAssigneeFilter: true,
            showDateRangeFilter: true,
            showTagFilter: true,
            showSearch: true,
        },
        kanban: {
            showProjectFilter: level === "workspace",
            showStatusFilter: false, // Status is implicit (columns)
            showAssigneeFilter: true,
            showDateRangeFilter: true, // Enable date range filtering for due dates
            showTagFilter: true,
            showSearch: true,
            showParentTaskFilter: true,
        },
        gantt: {
            showProjectFilter: level === "workspace",
            showStatusFilter: true, // Enable status
            showAssigneeFilter: true,
            showDateRangeFilter: true, // Timeline focus
            showTagFilter: true,
            showSearch: true,
        },
    };

    return configs[view];
}

/**
 * Get active filters as array of badges
 */
export function getActiveFilters(filters: TaskFilters): ActiveFilter[] {
    const active: ActiveFilter[] = [];

    if (filters.projectId) {
        active.push({ key: "projectId", label: "Project", value: filters.projectId });
    }
    if (filters.status) {
        active.push({ key: "status", label: "Status", value: filters.status });
    }
    if (filters.assigneeId) {
        active.push({ key: "assigneeId", label: "Assignee", value: filters.assigneeId });
    }
    if (filters.startDate) {
        active.push({ key: "startDate", label: "Start Date", value: String(filters.startDate) });
    }
    if (filters.endDate) {
        active.push({ key: "endDate", label: "End Date", value: String(filters.endDate) });
    }
    if (filters.tagId) {
        active.push({ key: "tagId", label: "Tag", value: filters.tagId });
    }
    if (filters.search) {
        active.push({ key: "search", label: "Search", value: filters.search });
    }
    if (filters.parentTaskId) {
        active.push({ key: "parentTaskId", label: "Parent Task", value: filters.parentTaskId });
    }

    return active;
}

/**
 * Check if any filters are active
 */
export function hasActiveFilters(filters: TaskFilters): boolean {
    return getActiveFilters(filters).length > 0;
}

// ============================================================================
// TASK TYPES
// ============================================================================

/**
 * Task with its subtasks and pagination state
 */
export type TaskWithSubTasks = WorkspaceTaskType & {
    subTasks?: SubTaskType[];
    subTasksHasMore?: boolean;
    subTasksPage?: number;
    // Add isOptimistic if needed generally, though often casted
    isOptimistic?: boolean;
};

/**
 * Clear all filters
 */
export function clearAllFilters(): TaskFilters {
    return {};
}
