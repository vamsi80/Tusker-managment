"use client";

import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Search, Filter, RotateCcw, PackageOpen } from "lucide-react";

interface MaterialsFiltersProps {
    searchQuery: string;
    onSearchChange: (query: string) => void;
    selectedTask: string;
    onTaskChange: (task: string) => void;
    selectedStatus: string;
    onStatusChange: (status: string) => void;
    selectedUnit: string;
    onUnitChange: (unit: string) => void;
    tasks: string[];
    statuses: string[];
    units: string[];
    onReset: () => void;
}

export function MaterialsFilters({
    searchQuery,
    onSearchChange,
    selectedTask,
    onTaskChange,
    selectedStatus,
    onStatusChange,
    selectedUnit,
    onUnitChange,
    tasks,
    statuses,
    units,
    onReset
}: MaterialsFiltersProps) {
    const hasActiveFilters = searchQuery !== "" || selectedTask !== "all" || selectedStatus !== "all" || selectedUnit !== "all";

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
                    <Select value={selectedTask} onValueChange={onTaskChange}>
                        <SelectTrigger className="h-9 text-xs bg-background/50 border-border/80 rounded-lg">
                            <span className="flex items-center gap-1.5 truncate">
                                <Filter className="size-3 text-muted-foreground" />
                                <SelectValue placeholder="Filter by Task" />
                            </span>
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all" className="text-xs">All Tasks</SelectItem>
                            {tasks.map((task) => (
                                <SelectItem key={task} value={task} className="text-xs truncate">
                                    {task}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>

                {/* Material Status Selector */}
                <div className="w-full md:w-40">
                    <Select value={selectedStatus} onValueChange={onStatusChange}>
                        <SelectTrigger className="h-9 text-xs bg-background/50 border-border/80 rounded-lg">
                            <span className="flex items-center gap-1.5 truncate">
                                <PackageOpen className="size-3 text-muted-foreground" />
                                <SelectValue placeholder="Filter by Status" />
                            </span>
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all" className="text-xs">All Statuses</SelectItem>
                            {statuses.map((status) => (
                                <SelectItem key={status} value={status} className="text-xs">
                                    {status}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>

                {/* Material Unit Selector */}
                <div className="w-full md:w-36">
                    <Select value={selectedUnit} onValueChange={onUnitChange}>
                        <SelectTrigger className="h-9 text-xs bg-background/50 border-border/80 rounded-lg">
                            <span className="flex items-center gap-1.5 truncate">
                                <span className="font-mono text-[10px] text-muted-foreground uppercase">UoM</span>
                                <SelectValue placeholder="Filter by Unit" />
                            </span>
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all" className="text-xs">All Units</SelectItem>
                            {units.map((unit) => (
                                <SelectItem key={unit} value={unit} className="text-xs">
                                    {unit}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
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
