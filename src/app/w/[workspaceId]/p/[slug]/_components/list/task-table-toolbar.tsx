"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
    DropdownMenu,
    DropdownMenuCheckboxItem,
    DropdownMenuContent,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Filter, Settings2, X, CalendarIcon } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { getStatusLabel } from "@/lib/colors/status-colors";
import { TaskStatus } from "@/generated/prisma";

export type ColumnVisibility = {
    assignee: boolean;
    status: boolean;
    startDate: boolean;
    dueDate: boolean;
    progress: boolean;
    tag: boolean;
    description: boolean;
};

export interface AdvancedFilters {
    projectId?: string;
    status?: string;
    assigneeId?: string;
    tag?: string;
    startDate?: Date;
    endDate?: Date;
}

interface TaskTableToolbarProps {
    searchQuery: string;
    setSearchQuery: (query: string) => void;
    tagFilter: string | null;
    setTagFilter: (tag: string | null) => void;
    uniqueTags: string[];
    columnVisibility: ColumnVisibility;
    setColumnVisibility: React.Dispatch<React.SetStateAction<ColumnVisibility>>;

    // Advanced filters (optional - for workspace view)
    advancedFilters?: AdvancedFilters;
    setAdvancedFilters?: (filters: AdvancedFilters) => void;
    availableProjects?: Array<{ id: string; name: string }>;
    availableStatuses?: TaskStatus[];
    availableAssignees?: Array<{ id: string; name: string; surname?: string | null }>;
    showProjectFilter?: boolean; // Show project filter only in workspace view
}

export function TaskTableToolbar({
    searchQuery,
    setSearchQuery,
    tagFilter,
    setTagFilter,
    uniqueTags,
    columnVisibility,
    setColumnVisibility,
    advancedFilters,
    setAdvancedFilters,
    availableProjects = [],
    availableStatuses = [],
    availableAssignees = [],
    showProjectFilter = false,
}: TaskTableToolbarProps) {
    const toggleColumn = (column: keyof ColumnVisibility) => {
        setColumnVisibility((prev) => ({ ...prev, [column]: !prev[column] }));
    };

    const hasAdvancedFilters = advancedFilters && setAdvancedFilters;
    const activeFilterCount = hasAdvancedFilters
        ? Object.values(advancedFilters).filter(v => v && v !== "all").length
        : 0;

    const clearAllFilters = () => {
        if (setAdvancedFilters) {
            setAdvancedFilters({
                projectId: "all",
                status: "all",
                assigneeId: "all",
                tag: "all",
                startDate: undefined,
                endDate: undefined,
            });
        }
        setSearchQuery("");
        setTagFilter(null);
    };

    return (
        <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 flex-1">
                {/* Search */}
                <div className="relative max-w-sm">
                    <Input
                        placeholder="Search tasks..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="pr-8"
                    />
                    {searchQuery && (
                        <Button
                            variant="ghost"
                            size="icon"
                            className="absolute right-0 top-0 h-full w-8"
                            onClick={() => setSearchQuery("")}
                        >
                            <X className="h-4 w-4" />
                        </Button>
                    )}
                </div>
            </div>

            {/* Column Visibility */}
            <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm" className="gap-2">
                        <Settings2 className="h-4 w-4" />
                        Columns
                    </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                    <DropdownMenuLabel>Toggle Columns</DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    <DropdownMenuCheckboxItem
                        checked={columnVisibility.description}
                        onCheckedChange={() => toggleColumn("description")}
                    >
                        Description
                    </DropdownMenuCheckboxItem>
                    <DropdownMenuCheckboxItem
                        checked={columnVisibility.assignee}
                        onCheckedChange={() => toggleColumn("assignee")}
                    >
                        Assignee
                    </DropdownMenuCheckboxItem>
                    <DropdownMenuCheckboxItem
                        checked={columnVisibility.status}
                        onCheckedChange={() => toggleColumn("status")}
                    >
                        Status
                    </DropdownMenuCheckboxItem>
                    <DropdownMenuCheckboxItem
                        checked={columnVisibility.startDate}
                        onCheckedChange={() => toggleColumn("startDate")}
                    >
                        Start Date
                    </DropdownMenuCheckboxItem>
                    <DropdownMenuCheckboxItem
                        checked={columnVisibility.dueDate}
                        onCheckedChange={() => toggleColumn("dueDate")}
                    >
                        Due Date
                    </DropdownMenuCheckboxItem>
                    <DropdownMenuCheckboxItem
                        checked={columnVisibility.progress}
                        onCheckedChange={() => toggleColumn("progress")}
                    >
                        Progress
                    </DropdownMenuCheckboxItem>
                    <DropdownMenuCheckboxItem
                        checked={columnVisibility.tag}
                        onCheckedChange={() => toggleColumn("tag")}
                    >
                        Tag
                    </DropdownMenuCheckboxItem>
                </DropdownMenuContent>
            </DropdownMenu>
        </div>
    );
}
