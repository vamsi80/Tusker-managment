import React from "react";
import { TableRow, TableCell } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { ChevronDown, ChevronRight, Folder } from "lucide-react";

interface ProjectRowProps {
    project: { id: string; name: string; color?: string };
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
                className="group bg-white dark:bg-card hover:bg-accent/40 cursor-pointer transition-colors h-8 sticky top-10 z-[15]"
                onClick={onToggle}
            >
                <TableCell colSpan={colSpan} className="py-2.5 px-4 border border-border/70">
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

                        <span className="text-[15px] font-medium text-foreground">{project.name}</span>
                        {totalTasksCount != null && (
                            <span className="flex h-5 min-w-5 items-center justify-center rounded-full border border-foreground/40 px-1 text-[10px] tabular-nums">
                                {totalTasksCount}
                            </span>
                        )}

                    </div>
                </TableCell>
            </TableRow>
            {isExpanded && children}
        </>
    );
}

