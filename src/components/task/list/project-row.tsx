import React from "react";
import { TableRow, TableCell } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { ChevronDown, ChevronRight, Folder, CornerDownRight } from "lucide-react";

interface ProjectRowProps {
    project: { id: string; name: string; color?: string };
    tasksCount: number;
    isExpanded: boolean;
    onToggle: () => void;
    colSpan: number;
    children?: React.ReactNode;
}

export function ProjectRow({
    project,
    tasksCount,
    isExpanded,
    onToggle,
    colSpan,
    children
}: ProjectRowProps) {
    return (
        <>
            <TableRow
                className="bg-muted/50 hover:bg-muted/70 cursor-pointer transition-colors h-8"
                onClick={onToggle}
            >
                <TableCell colSpan={colSpan} className="py-1 px-2 font-medium">
                    <div className="flex items-center gap-2">
                        <CornerDownRight className="h-3 w-3 text-muted-foreground" />
                        <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 w-6 p-0 hover:bg-transparent"
                            onClick={(e) => {
                                e.stopPropagation();
                                onToggle();
                            }}
                        >
                            {isExpanded ? (
                                <ChevronDown className="h-4 w-4 text-muted-foreground" />
                            ) : (
                                <ChevronRight className="h-4 w-4 text-muted-foreground" />
                            )}
                        </Button>

                        <Folder
                            className="h-4 w-4"
                            style={{ color: project.color || "#666", fill: project.color ? `${project.color}33` : "#66633" }}
                        />

                        <span className="text-sm font-semibold">{project.name}</span>

                        <span className="text-xs text-muted-foreground ml-2">
                            {tasksCount}
                        </span>
                    </div>
                </TableCell>
            </TableRow>
            {isExpanded && children}
        </>
    );
}
