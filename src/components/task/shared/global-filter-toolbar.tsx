"use client";

import { Button } from "@/components/ui/button";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { X, Filter, Calendar } from "lucide-react";
import { cn } from "@/lib/utils";
import {
    type TaskFilters,
    type ViewLevel,
    type ViewType,
    type TaskStatus,
    type TaskTag,
    type ProjectOption,
    type MemberOption,
    getFilterConfig,
    getActiveFilters,
    hasActiveFilters,
} from "./types";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import { format } from "date-fns";
import { TaskSearch } from "./task-search";

const STATUS_OPTIONS: { value: TaskStatus; label: string }[] = [
    { value: "TO_DO", label: "To Do" },
    { value: "IN_PROGRESS", label: "In Progress" },
    { value: "BLOCKED", label: "Blocked" },
    { value: "REVIEW", label: "Review" },
    { value: "HOLD", label: "On Hold" },
    { value: "COMPLETED", label: "Completed" },
];

const TAG_OPTIONS: { value: TaskTag; label: string }[] = [
    { value: "DESIGN", label: "Design" },
    { value: "PROCUREMENT", label: "Procurement" },
    { value: "CONTRACTOR", label: "Contractor" },
];

interface GlobalFilterToolbarProps {
    /** Current view level (project or workspace) */
    level: ViewLevel;

    /** Current view type (dashboard, list, kanban, gantt) */
    view: ViewType;

    /** Current filter values */
    filters: TaskFilters;

    /** Search query value */
    searchQuery: string;

    /** Available projects (for workspace level) */
    projects?: ProjectOption[];

    /** Available members for assignee filter */
    members?: MemberOption[];

    /** Callback when filters change */
    onFilterChange: (filters: TaskFilters) => void;

    /** Callback when search changes */
    onSearchChange: (query: string) => void;

    /** Callback to clear all filters */
    onClearAll: () => void;

    /** Optional additional CSS classes */
    className?: string;

    /** Show search input */
    showSearch?: boolean;
}

/**
 * Global Filter Toolbar Component
 * 
 * A unified filter toolbar that adapts based on the current view and level.
 * Combines search and filters into a single, consistent UI component.
 * 
 * Features:
 * - Adaptive filters based on view type (list/kanban/gantt)
 * - Adaptive filters based on level (project/workspace)
 * - Integrated search
 * - Active filter badges
 * - Clear all button
 * - Responsive design
 * 
 * @example
 * // Project-level List view
 * <GlobalFilterToolbar
 *   level="project"
 *   view="list"
 *   filters={filters}
 *   searchQuery={search}
 *   members={members}
 *   onFilterChange={setFilters}
 *   onSearchChange={setSearch}
 *   onClearAll={clearAll}
 * />
 * 
 * @example
 * // Workspace-level Kanban view
 * <GlobalFilterToolbar
 *   level="workspace"
 *   view="kanban"
 *   filters={filters}
 *   searchQuery={search}
 *   projects={projects}
 *   members={members}
 *   onFilterChange={setFilters}
 *   onSearchChange={setSearch}
 *   onClearAll={clearAll}
 * />
 */
export function GlobalFilterToolbar({
    level,
    view,
    filters,
    searchQuery,
    projects,
    members,
    onFilterChange,
    onSearchChange,
    onClearAll,
    className,
    showSearch = true,
}: GlobalFilterToolbarProps) {
    // Get filter configuration based on view and level
    const config = getFilterConfig(view, level);
    const activeFilters = getActiveFilters(filters);
    const hasFilters = hasActiveFilters(filters) || searchQuery.length > 0;

    const handleFilterChange = (key: keyof TaskFilters, value: string | undefined) => {
        // Convert '__all__' to undefined to clear the filter
        const filterValue = value === '__all__' ? undefined : value;
        onFilterChange({
            ...filters,
            [key]: filterValue,
        });
    };

    const removeFilter = (key: keyof TaskFilters) => {
        handleFilterChange(key, undefined);
    };

    const handleClearAll = () => {
        onClearAll();
        onSearchChange("");
    };

    return (
        <div className={cn("space-y-3", className)}>
            {/* Search and Filter Controls Row */}
            <div className="flex flex-wrap items-center gap-2">
                {/* Search */}
                {showSearch && config.showSearch && (
                    <TaskSearch
                        value={searchQuery}
                        onChange={onSearchChange}
                        placeholder={`Search ${view === 'kanban' ? 'subtasks' : 'tasks'}...`}
                        className="flex-1 min-w-[200px] max-w-sm"
                    />
                )}

                {/* Filter Label */}
                {(config.showProjectFilter || config.showStatusFilter || config.showAssigneeFilter ||
                    config.showDateRangeFilter || config.showTagFilter || config.showParentTaskFilter) && (
                        <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                            <Filter className="h-4 w-4" />
                            <span className="hidden sm:inline">Filters:</span>
                        </div>
                    )}

                {/* Project Filter (Workspace level only) */}
                {config.showProjectFilter && level === "workspace" && projects && (
                    <Select
                        value={filters.projectId || "__all__"}
                        onValueChange={(value) => handleFilterChange("projectId", value)}
                    >
                        <SelectTrigger className="w-[180px] h-9">
                            <SelectValue placeholder="All Projects" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="__all__">All Projects</SelectItem>
                            {projects.map((project) => (
                                <SelectItem key={project.id} value={project.id}>
                                    {project.name}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                )}

                {/* Status Filter */}
                {config.showStatusFilter && (
                    <Select
                        value={filters.status || "__all__"}
                        onValueChange={(value) => handleFilterChange("status", value)}
                    >
                        <SelectTrigger className="w-[160px] h-9">
                            <SelectValue placeholder="All Statuses" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="__all__">All Statuses</SelectItem>
                            {STATUS_OPTIONS.map((option) => (
                                <SelectItem key={option.value} value={option.value}>
                                    {option.label}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                )}

                {/* Assignee Filter */}
                {config.showAssigneeFilter && members && (
                    <Select
                        value={filters.assigneeId || "__all__"}
                        onValueChange={(value) => handleFilterChange("assigneeId", value)}
                    >
                        <SelectTrigger className="w-[180px] h-9">
                            <SelectValue placeholder="All Assignees" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="__all__">All Assignees</SelectItem>
                            {members.map((member) => (
                                <SelectItem key={member.id} value={member.id}>
                                    {member.name} {member.surname || ""}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                )}

                {/* Tag Filter */}
                {config.showTagFilter && (
                    <Select
                        value={filters.tag || "__all__"}
                        onValueChange={(value) => handleFilterChange("tag", value)}
                    >
                        <SelectTrigger className="w-[160px] h-9">
                            <SelectValue placeholder="All Tags" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="__all__">All Tags</SelectItem>
                            {TAG_OPTIONS.map((option) => (
                                <SelectItem key={option.value} value={option.value}>
                                    {option.label}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                )}

                {/* Date Range Filter */}
                {config.showDateRangeFilter && (
                    <Popover>
                        <PopoverTrigger asChild>
                            <Button variant="outline" size="sm" className="gap-2 h-9">
                                <Calendar className="h-4 w-4" />
                                {filters.startDate || filters.endDate ? (
                                    <span className="text-xs">
                                        {filters.startDate && format(new Date(filters.startDate), "MMM d")}
                                        {filters.startDate && filters.endDate && " - "}
                                        {filters.endDate && format(new Date(filters.endDate), "MMM d")}
                                    </span>
                                ) : (
                                    <span className="text-xs">Date Range</span>
                                )}
                            </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                            <div className="p-3 space-y-3">
                                <div>
                                    <label className="text-sm font-medium">Start Date</label>
                                    <CalendarComponent
                                        mode="single"
                                        selected={filters.startDate ? new Date(filters.startDate) : undefined}
                                        onSelect={(date) => handleFilterChange("startDate", date?.toISOString())}
                                    />
                                </div>
                                <div>
                                    <label className="text-sm font-medium">End Date</label>
                                    <CalendarComponent
                                        mode="single"
                                        selected={filters.endDate ? new Date(filters.endDate) : undefined}
                                        onSelect={(date) => handleFilterChange("endDate", date?.toISOString())}
                                    />
                                </div>
                            </div>
                        </PopoverContent>
                    </Popover>
                )}

                {/* Clear All Button */}
                {hasFilters && (
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={handleClearAll}
                        className="gap-2 h-9"
                    >
                        <X className="h-4 w-4" />
                        <span className="hidden sm:inline">Clear All</span>
                    </Button>
                )}
            </div>

            {/* Active Filter Badges */}
            {activeFilters.length > 0 && (
                <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs text-muted-foreground">Active:</span>
                    {activeFilters.map((filter) => (
                        <Badge
                            key={filter.key}
                            variant="secondary"
                            className="gap-1 pr-1 text-xs"
                        >
                            <span>
                                {filter.label}: {filter.value}
                            </span>
                            <Button
                                variant="ghost"
                                size="sm"
                                className="h-4 w-4 p-0 hover:bg-transparent"
                                onClick={() => removeFilter(filter.key)}
                            >
                                <X className="h-3 w-3" />
                            </Button>
                        </Badge>
                    ))}
                    {searchQuery && (
                        <Badge
                            variant="secondary"
                            className="gap-1 pr-1 text-xs"
                        >
                            <span>Search: {searchQuery}</span>
                            <Button
                                variant="ghost"
                                size="sm"
                                className="h-4 w-4 p-0 hover:bg-transparent"
                                onClick={() => onSearchChange("")}
                            >
                                <X className="h-3 w-3" />
                            </Button>
                        </Badge>
                    )}
                </div>
            )}
        </div>
    );
}
