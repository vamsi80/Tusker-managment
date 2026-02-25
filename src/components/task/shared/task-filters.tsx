"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
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
    type FilterComponentProps,
    type TaskStatus,
    type TaskTag,
    getFilterConfig,
    getActiveFilters,
    hasActiveFilters,
} from "./types";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import { format } from "date-fns";

const STATUS_OPTIONS: { value: TaskStatus; label: string }[] = [
    { value: "TO_DO", label: "To Do" },
    { value: "IN_PROGRESS", label: "In Progress" },
    { value: "REVIEW", label: "Review" },
    { value: "HOLD", label: "On Hold" },
    { value: "COMPLETED", label: "Completed" },
    { value: "BLOCKED", label: "Blocked" },
];

const TAG_OPTIONS: { value: TaskTag; label: string }[] = [
    { value: "DESIGN", label: "Design" },
    { value: "PROCUREMENT", label: "Procurement" },
    { value: "CONTRACTOR", label: "Contractor" },
];

/**
 * Task Filters Component
 * 
 * Adaptive filter component that changes based on context (project/workspace)
 * and view type (dashboard/list/kanban/gantt).
 * 
 * Automatically reloads data when filters change by updating URL search params.
 * 
 * Features:
 * - Adaptive filters based on level and view
 * - URL-based filter state (shareable links)
 * - Active filter badges
 * - Clear all button
 * - Automatic data reload on filter change
 * - Responsive design
 * 
 * @param level - 'project' or 'workspace' (determines if project filter is shown)
 * @param view - Current view type (determines which filters are available)
 * @param filters - Current filter values
 * @param projects - Available projects (for workspace level)
 * @param members - Available members for assignee filter
 * @param onFilterChange - Callback when filters change
 * @param onClearFilters - Callback to clear all filters
 */
export function TaskFilters({
    level,
    view,
    filters,
    projects,
    members,
    onFilterChange,
    onClearFilters,
    className,
}: FilterComponentProps & { className?: string }) {
    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();

    // Get filter configuration based on view and level
    const config = getFilterConfig(view, level);
    const activeFilters = getActiveFilters(filters);
    const hasFilters = hasActiveFilters(filters);

    // Update URL when filters change
    useEffect(() => {
        const params = new URLSearchParams(searchParams.toString());

        // Update filter params
        Object.entries(filters).forEach(([key, value]) => {
            if (value) {
                params.set(key, String(value));
            } else {
                params.delete(key);
            }
        });

        // Navigate to new URL (triggers automatic reload)
        const newUrl = params.toString() ? `${pathname}?${params.toString()}` : pathname;
        router.push(newUrl, { scroll: false });
    }, [filters, pathname, router, searchParams]);

    const handleFilterChange = (key: keyof TaskFilters, value: string | undefined) => {
        onFilterChange({
            ...filters,
            [key]: value || undefined,
        });
    };

    const handleClearAll = () => {
        onClearFilters();
    };

    const removeFilter = (key: keyof TaskFilters) => {
        handleFilterChange(key, undefined);
    };

    return (
        <div className={cn("space-y-3", className)}>
            {/* Filter Controls */}
            <div className="flex flex-wrap items-center gap-2">
                <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                    <Filter className="h-4 w-4" />
                    <span className="hidden sm:inline">Filters:</span>
                </div>

                {/* Project Filter (Workspace level only) */}
                {config.showProjectFilter && level === "workspace" && projects && (
                    <Select
                        value={filters.projectId || ""}
                        onValueChange={(value) => handleFilterChange("projectId", value)}
                    >
                        <SelectTrigger className="w-[180px]">
                            <SelectValue placeholder="All Projects" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="">All Projects</SelectItem>
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
                        value={filters.status || ""}
                        onValueChange={(value) => handleFilterChange("status", value)}
                    >
                        <SelectTrigger className="w-[160px]">
                            <SelectValue placeholder="All Statuses" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="">All Statuses</SelectItem>
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
                        value={filters.assigneeId || ""}
                        onValueChange={(value) => handleFilterChange("assigneeId", value)}
                    >
                        <SelectTrigger className="w-[180px]">
                            <SelectValue placeholder="All Assignees" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="">All Assignees</SelectItem>
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
                        value={filters.tagId || ""}
                        onValueChange={(value) => handleFilterChange("tagId", value)}
                    >
                        <SelectTrigger className="w-[160px]">
                            <SelectValue placeholder="All Tags" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="">All Tags</SelectItem>
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
                            <Button variant="outline" size="sm" className="gap-2">
                                <Calendar className="h-4 w-4" />
                                {filters.startDate || filters.endDate ? (
                                    <span>
                                        {filters.startDate && format(new Date(filters.startDate), "MMM d")}
                                        {filters.startDate && filters.endDate && " - "}
                                        {filters.endDate && format(new Date(filters.endDate), "MMM d")}
                                    </span>
                                ) : (
                                    <span>Date Range</span>
                                )}
                            </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                            <div className="p-3 space-y-2">
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
                        className="gap-2"
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
                            className="gap-1 pr-1"
                        >
                            <span className="text-xs">
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
                </div>
            )}
        </div>
    );
}
