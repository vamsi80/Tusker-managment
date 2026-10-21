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
    <thead>
      {/* Headings after Task Name are centred, like the values under them
          (subtask-row, sorted-task-row). data-align="left" opts a column out. */}
      <tr className="sticky top-0 z-10 bg-surface-solid [&>th:nth-child(n+3):not([data-align=left])]:text-center [&>th:nth-child(n+3):not([data-align=left])>button]:justify-center">
        <th className="text-muted-foreground h-10 px-2 text-left align-middle font-normal whitespace-nowrap w-[50px] sticky left-0 z-0 bg-surface-solid">
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
          className="w-[80px] sm:w-[120px] md:w-[220px] sticky left-[50px] z-30 bg-surface-solid"
        />
        {columnVisibility.description && (
          <th data-align="left" className="text-muted-foreground h-10 px-2 text-left align-middle font-normal whitespace-nowrap w-[150px] sm:w-[200px] bg-surface-solid">
            Description
          </th>
        )}
        {columnVisibility.assignee && (
          <th className="text-muted-foreground h-10 px-2 text-left align-middle font-normal whitespace-nowrap w-[80px] sm:w-[100px] bg-surface-solid">
            Assignee
          </th>
        )}
        {columnVisibility.reviewer && (
          <th className="text-muted-foreground h-10 px-2 text-left align-middle font-normal whitespace-nowrap w-[80px] sm:w-[100px] bg-surface-solid">
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
          <th className="text-muted-foreground h-10 px-2 text-left align-middle font-normal whitespace-nowrap w-[90px] sm:w-[120px] bg-surface-solid">
            Start Date
          </th>
        )}
        {columnVisibility.dueDate && (
          <th className="text-muted-foreground h-10 px-2 text-left align-middle font-normal whitespace-nowrap w-[100px] sm:w-[120px] bg-surface-solid">
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
          <th className="text-muted-foreground h-10 px-2 text-left align-middle font-normal whitespace-nowrap w-[100px] sm:w-[100px] bg-surface-solid">
            Tag
          </th>
        )}
        <th className="text-muted-foreground h-10 px-2 text-left align-middle font-normal whitespace-nowrap w-[40px] bg-surface-solid"></th>
      </tr>
    </thead>
  );
}

