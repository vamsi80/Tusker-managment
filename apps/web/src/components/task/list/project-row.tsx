import React from "react";
import { TableRow, TableCell } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { ChevronDown, ChevronRight, Folder } from "lucide-react";

interface ProjectRowProps {
    project: { id: string; name: string; color?: string | null };
    totalTasksCount?: number;
    isExpanded: boolean;
    onToggle: () => void;
    colSpan: number;
    children?: React.ReactNode;
}

export function ProjectRow({
    project,
    totalTasksCount,
    isExpanded,
    onToggle,
    colSpan,
    children,
}: ProjectRowProps) {
    return (
        <>
            <TableRow
                className="group [&_td]:py-2 bg-white dark:bg-neutral-900 hover:bg-neutral-50 dark:hover:bg-neutral-800/50 cursor-pointer transition-colors h-8 sticky top-10 z-[15]"
                onClick={onToggle}
            >
                <TableCell colSpan={colSpan} className="py-2 px-4 shadow-[0_1px_2px_0_rgba(0,0,0,0.05)] border-y border-neutral-200 dark:border-neutral-800">
                    <div className="flex items-center gap-2">
                        <Button
                            variant="ghost"
                            size="sm"
                            className="size-6 p-0 hover:bg-transparent"
                            onClick={(e) => {
                                e.stopPropagation();
                                onToggle();
                            }}
                        >
                            {isExpanded ? (
                                <ChevronDown className="size-4 text-muted-foreground" />
                            ) : (
                                <ChevronRight className="size-4 text-muted-foreground" />
                            )}
                        </Button>

                        <Folder
                            className="size-4"
                            style={{ color: project.color || "#666", fill: project.color ? `${project.color}33` : "#66633" }}
                        />

                        <span className="text-sm font-semibold text-foreground">{project.name}</span>


                    </div>
                </TableCell>
            </TableRow>
            {isExpanded && children}
        </>
    );
}

