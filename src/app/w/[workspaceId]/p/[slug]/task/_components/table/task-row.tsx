"use client";

import { TableCell, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ChevronDown, ChevronRight, MoreHorizontal, Calendar, Loader2 } from "lucide-react";
import { ColumnVisibility } from "./task-table-toolbar";
import { TaskWithSubTasks } from "./types";

interface TaskRowProps {
    task: TaskWithSubTasks;
    isExpanded: boolean;
    isLoading: boolean;
    onToggleExpand: () => void;
    columnVisibility: ColumnVisibility;
}

export function TaskRow({
    task,
    isExpanded,
    isLoading,
    onToggleExpand,
    columnVisibility,
}: TaskRowProps) {
    const assignee = task.assignee?.workspaceMember?.user;

    const subtaskAssignees = task.subTasks
        ?.map((st) => st.assignee?.workspaceMember?.user)
        .filter((user, index, self) =>
            user && self.findIndex((u) => u?.id === user.id) === index
        ) || [];

    const subtaskCount = task._count?.subTasks || 0;

    return (
        <TableRow className="group">
            <TableCell>
                <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={onToggleExpand}
                    disabled={isLoading}
                >
                    {isLoading ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                    ) : isExpanded ? (
                        <ChevronDown className="h-4 w-4" />
                    ) : (
                        <ChevronRight className="h-4 w-4" />
                    )}
                </Button>
            </TableCell>
            <TableCell className="font-medium">
                <div className="flex items-center gap-2">
                    <span>{task.name}</span>
                    {subtaskCount > 0 && (
                        <Badge variant="outline" className="text-xs font-normal text-muted-foreground shrink-0">
                            {subtaskCount}
                        </Badge>
                    )}
                </div>
            </TableCell>
            {columnVisibility.assignee && (
                <TableCell className="p-0 pl-2">
                    <div className="flex items-center gap-2">
                        {assignee && (
                            <div className="flex items-center gap-2">
                                <Avatar className="h-6 w-6">
                                    <AvatarImage src={assignee.image || ""} />
                                    <AvatarFallback>{assignee.name?.[0]}</AvatarFallback>
                                </Avatar>
                                <span className="text-sm text-muted-foreground">
                                    {assignee.name}
                                </span>
                            </div>
                        )}

                        {subtaskAssignees.length > 0 && (
                            <div className="flex items-center -space-x-2">
                                {subtaskAssignees.slice(0, 3).map((user) => (
                                    <Avatar key={user!.id} className="h-6 w-6 border-2 border-background">
                                        <AvatarImage src={user!.image || ""} />
                                        <AvatarFallback className="text-[10px]">{user!.name?.[0]}</AvatarFallback>
                                    </Avatar>
                                ))}
                                {subtaskAssignees.length > 3 && (
                                    <div className="h-6 w-6 rounded-full bg-muted border-2 border-background flex items-center justify-center">
                                        <span className="text-[10px] font-medium">+{subtaskAssignees.length - 3}</span>
                                    </div>
                                )}
                            </div>
                        )}

                        {!assignee && subtaskAssignees.length === 0 && (
                            <span className="text-sm text-muted-foreground">Unassigned</span>
                        )}
                    </div>
                </TableCell>
            )}
            {columnVisibility.dueDate && (
                <TableCell>
                    {task.dueDate ? (
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <Calendar className="h-3.5 w-3.5" />
                            {new Date(task.dueDate).toLocaleDateString('en-GB')}
                        </div>
                    ) : (
                        <span className="text-muted-foreground">-</span>
                    )}
                </TableCell>
            )}
            {columnVisibility.tag && (
                <TableCell>
                    {task.tag ? (
                        <Badge variant="secondary" className="rounded-md">
                            {task.tag}
                        </Badge>
                    ) : (
                        <span className="text-muted-foreground">-</span>
                    )}
                </TableCell>
            )}
            <TableCell>
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                            <MoreHorizontal className="h-4 w-4" />
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                        <DropdownMenuItem>Edit</DropdownMenuItem>
                        <DropdownMenuItem className="text-destructive">
                            Delete
                        </DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>
            </TableCell>
        </TableRow>
    );
}
