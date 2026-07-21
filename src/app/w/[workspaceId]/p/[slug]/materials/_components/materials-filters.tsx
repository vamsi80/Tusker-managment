"use client";

import { Input } from "@/components/ui/input";
import { MultiSelectFilter } from "@/components/ui/multi-select-filter";
import { Button } from "@/components/ui/button";
import { Search, RotateCcw } from "lucide-react";

interface MaterialsFiltersProps {
    searchQuery: string;
    onSearchChange: (query: string) => void;
    selectedTasks: string[];
    onTasksChange: (tasks: string[]) => void;
    selectedStatuses: string[];
    onStatusesChange: (statuses: string[]) => void;
    selectedUnits: string[];
    onUnitsChange: (units: string[]) => void;
    tasks: string[];
    statuses: string[];
    units: string[];
    onReset: () => void;
}

export function MaterialsFilters({
    searchQuery,
    onSearchChange,
    selectedTasks,
    onTasksChange,
    selectedStatuses,
    onStatusesChange,
    selectedUnits,
    onUnitsChange,
    tasks,
    statuses,
    units,
    onReset
}: MaterialsFiltersProps) {
    const hasActiveFilters = searchQuery !== "" || selectedTasks.length > 0 || selectedStatuses.length > 0 || selectedUnits.length > 0;

    return (
        <div className="bg-card/45 p-0 flex flex-col md:flex-row gap-3 items-center justify-between transition-all duration-300 hover:shadow-md">
            <div className="flex flex-wrap items-center gap-3 w-full md:w-auto flex-1">
                {/* Search Input */}
                <div className="relative w-full md:w-72">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground transition-colors group-hover:text-primary" />
                    <Input
                        placeholder="Search materials or tasks..."
                        value={searchQuery}
                        onChange={(e) => onSearchChange(e.target.value)}
                        className="pl-9 h-9 text-xs w-full bg-background/50 border-border/80 focus:border-primary/50 focus:ring-primary/20 transition-all rounded-lg"
                    />
                </div>

                {/* Parent Task Selector */}
                <div className="w-full md:w-48">
                    <MultiSelectFilter
                        selected={selectedTasks}
                        onChange={onTasksChange}
                        options={tasks.map((task) => ({ value: task, label: task }))}
                        placeholder="All Tasks"
                        searchPlaceholder="Search tasks..."
                        triggerClassName="h-9 text-xs bg-background/50 border-border/80 rounded-lg"
                    />
                </div>

                {/* Material Status Selector */}
                <div className="w-full md:w-40">
                    <MultiSelectFilter
                        selected={selectedStatuses}
                        onChange={onStatusesChange}
                        options={statuses.map((status) => ({ value: status, label: status }))}
                        placeholder="All Statuses"
                        searchPlaceholder="Search statuses..."
                        triggerClassName="h-9 text-xs bg-background/50 border-border/80 rounded-lg"
                    />
                </div>

                {/* Material Unit Selector */}
                <div className="w-full md:w-36">
                    <MultiSelectFilter
                        selected={selectedUnits}
                        onChange={onUnitsChange}
                        options={units.map((unit) => ({ value: unit, label: unit }))}
                        placeholder="All Units"
                        searchPlaceholder="Search units..."
                        triggerClassName="h-9 text-xs bg-background/50 border-border/80 rounded-lg"
                    />
                </div>
            </div>

            {/* Reset Button */}
            {hasActiveFilters && (
                <Button
                    onClick={onReset}
                    variant="ghost"
                    className="h-9 text-xs text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-all rounded-lg shrink-0 px-3 w-full md:w-auto flex items-center justify-center gap-1.5"
                >
                    <RotateCcw className="size-3.5" />
                    Reset Filters
                </Button>
            )}
        </div>
    );
}
