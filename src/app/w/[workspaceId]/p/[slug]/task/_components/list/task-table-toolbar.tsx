"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
    DropdownMenu,
    DropdownMenuCheckboxItem,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Filter, Settings2, X } from "lucide-react";

export type ColumnVisibility = {
    assignee: boolean;
    status: boolean;
    startDate: boolean;
    dueDate: boolean;
    progress: boolean;
    tag: boolean;
    description: boolean;
};

interface TaskTableToolbarProps {
    searchQuery: string;
    setSearchQuery: (query: string) => void;
    tagFilter: string | null;
    setTagFilter: (tag: string | null) => void;
    uniqueTags: string[];
    columnVisibility: ColumnVisibility;
    setColumnVisibility: React.Dispatch<React.SetStateAction<ColumnVisibility>>;
}

export function TaskTableToolbar({
    searchQuery,
    setSearchQuery,
    tagFilter,
    setTagFilter,
    uniqueTags,
    columnVisibility,
    setColumnVisibility,
}: TaskTableToolbarProps) {
    const toggleColumn = (column: keyof ColumnVisibility) => {
        setColumnVisibility((prev) => ({ ...prev, [column]: !prev[column] }));
    };

    return (
        <div className="flex items-center justify-between gap-3">
            <div className="relative flex-1 max-w-sm">
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

            {/* Tag Filter */}
            <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm" className="gap-2">
                        <Filter className="h-4 w-4" />
                        {tagFilter || "All Tags"}
                    </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                    <DropdownMenuLabel>Filter by Tag</DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => setTagFilter(null)}>
                        All Tags
                    </DropdownMenuItem>
                    {uniqueTags.map((tag) => (
                        <DropdownMenuItem key={tag} onClick={() => setTagFilter(tag)}>
                            {tag}
                        </DropdownMenuItem>
                    ))}
                </DropdownMenuContent>
            </DropdownMenu>

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
                        checked={columnVisibility.status}
                        onCheckedChange={() => toggleColumn("status")}
                    >
                        Status
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
