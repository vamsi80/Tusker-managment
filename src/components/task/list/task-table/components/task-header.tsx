"use client";

import React from "react";
import { useTaskTableContext } from "../context/task-table-context";
import { SortableHeader } from "../../sort/sortable-header";
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuItem, 
  DropdownMenuTrigger 
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { ChevronsUpDown, Maximize2, Minimize2 } from "lucide-react";
import { SortConfig, SortField } from "@/components/task/shared/types";

interface TaskTableHeaderProps {
  sorts: SortConfig[];
  onSortChange: (field: SortField) => void;
  onExpandAll: () => void;
  onCollapseAll: () => void;
}

export function TaskTableHeader({
  sorts,
  onSortChange,
  onExpandAll,
  onCollapseAll,
}: TaskTableHeaderProps) {
  const { columnVisibility } = useTaskTableContext();

  return (
    <thead className="[&_tr]:border-b">
      <tr className="sticky top-0 z-10 bg-background border-b shadow-sm hover:bg-muted/50">
        <th className="text-foreground h-10 px-2 text-left align-middle font-medium whitespace-nowrap w-[50px] sticky left-0 z-0 bg-background">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="size-8 hover:bg-muted">
                <ChevronsUpDown className="size-4 text-muted-foreground" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuItem onClick={onExpandAll}>
                <Maximize2 className="mr-2 size-4" />
                Expand All
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onCollapseAll}>
                <Minimize2 className="mr-2 size-4" />
                Collapse All
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </th>
        <SortableHeader
          field="name"
          label="Task Name"
          sorts={sorts}
          onSortChange={onSortChange}
          className="w-[80px] sm:w-[120px] md:w-[220px] sticky left-[50px] z-30 bg-background"
        />
        {columnVisibility.description && (
          <th className="text-foreground h-10 px-2 text-left align-middle font-medium whitespace-nowrap w-[150px] sm:w-[200px] bg-background">
            Description
          </th>
        )}
        {columnVisibility.assignee && (
          <th className="text-foreground h-10 px-2 text-left align-middle font-medium whitespace-nowrap w-[80px] sm:w-[100px] bg-background">
            Assignee
          </th>
        )}
        {columnVisibility.reviewer && (
          <th className="text-foreground h-10 px-2 text-left align-middle font-medium whitespace-nowrap w-[80px] sm:w-[100px] bg-background">
            Reviewer
          </th>
        )}
        {columnVisibility.status && (
          <SortableHeader
            field="status"
            label="Status"
            sorts={sorts}
            onSortChange={onSortChange}
            className="w-[90px] sm:w-[90px]"
          />
        )}
        {columnVisibility.startDate && (
          <th className="text-foreground h-10 px-2 text-left align-middle font-medium whitespace-nowrap w-[90px] sm:w-[120px] bg-background">
            Start Date
          </th>
        )}
        {columnVisibility.dueDate && (
          <th className="text-foreground h-10 px-2 text-left align-middle font-medium whitespace-nowrap w-[100px] sm:w-[120px] bg-background">
            Due Date
          </th>
        )}
        {columnVisibility.progress && (
          <SortableHeader
            field="deadline"
            label="Deadline"
            sorts={sorts}
            onSortChange={onSortChange}
            className="w-[100px] sm:w-[100px]"
          />
        )}
        {columnVisibility.tag && (
          <th className="text-foreground h-10 px-2 text-left align-middle font-medium whitespace-nowrap w-[100px] sm:w-[100px] bg-background">
            Tag
          </th>
        )}
        <th className="text-foreground h-10 px-2 text-left align-middle font-medium whitespace-nowrap w-[40px] bg-background"></th>
      </tr>
    </thead>
  );
}

