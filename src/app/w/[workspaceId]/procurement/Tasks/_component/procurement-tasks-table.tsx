"use client";

import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { CreateIndentDialog } from "../../indent/_components/create-indent-dialog";
import { Button } from "@/components/ui/button";
import { IconPlus } from "@tabler/icons-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ProcurementTaskWithRelations } from "@/data/procurement";

import { WorkspaceMemberRow } from "@/data/workspace/get-workspace-members";
import { getColorFromString } from "@/lib/colors/project-colors";
import { getStatusColors, getStatusLabel } from "@/lib/colors/status-colors";
import { cn } from "@/lib/utils";

interface ProcurementTasksTableProps {
    workspaceId: string;
    procurementTasks: ProcurementTaskWithRelations[];
    projects: { id: string; name: string }[];
    tasks: { id: string; name: string; projectId: string }[];
    materials: { id: string; name: string; defaultUnitId: string; vendors?: { id: string; name: string }[] }[];
    units: { id: string; name: string; abbreviation: string }[];
    vendors: { id: string; name: string }[];
    userRole?: "OWNER" | "ADMIN" | "MEMBER" | "VIEWER";
    workspaceMembers: WorkspaceMemberRow[];
    currentMemberId: string;
}

export function ProcurementTasksTable({
    workspaceId,
    procurementTasks,
    projects,
    tasks,
    materials,
    units,
    vendors,
    userRole,
    workspaceMembers,
    currentMemberId
}: ProcurementTasksTableProps) {
    if (procurementTasks.length === 0) {
        return (
            <div className="text-center py-10 border rounded-lg bg-muted/20 border-dashed">
                <p className="text-muted-foreground">No active procurement tasks found.</p>
            </div>
        );
    }

    return (
        <div className="rounded-md border bg-card">
            <Table>
                <TableHeader>
                    <TableRow>
                        <TableHead>Task Name</TableHead>
                        <TableHead>Project</TableHead>
                        <TableHead>Assignee</TableHead>
                        <TableHead>Start Date</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Action</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {procurementTasks.map((pt) => {
                        // Accessing indentCreated from the root object (added to schema)
                        // Casting specific property if TS complains due to stale generation
                        const isIndentCreated = (pt as any).indentCreated;

                        return (
                            <TableRow key={pt.id} className={isIndentCreated ? "bg-muted/30" : ""}>
                                <TableCell className="font-medium">
                                    <div className="truncate max-w-[250px]" title={pt.task.name}>{pt.task.name}</div>
                                    {pt.task.description && (
                                        <div className="text-xs text-muted-foreground truncate max-w-[200px]">
                                            {pt.task.description}
                                        </div>
                                    )}
                                </TableCell>
                                <TableCell>
                                    <Badge variant="secondary" className="text-xs font-normal shrink-0 gap-1.5 pl-1.5 flex items-center">
                                        <div className="h-2 w-2 rounded-full" style={{ backgroundColor: pt.project.color || getColorFromString(pt.project.name) }} />
                                        {pt.project.name}
                                    </Badge>
                                </TableCell>
                                <TableCell>
                                    {pt.task.assignee ? (
                                        <div className="flex items-center gap-2">
                                            <Avatar className="h-6 w-6">
                                                <AvatarImage src={pt.task.assignee.image || undefined} />
                                                <AvatarFallback className="text-[10px]">
                                                    {pt.task.assignee.name?.charAt(0) || "U"}
                                                </AvatarFallback>
                                            </Avatar>
                                            <span className="text-sm">
                                                {pt.task.assignee.name}
                                            </span>
                                        </div>
                                    ) : (
                                        <span className="text-muted-foreground text-xs">-</span>
                                    )}
                                </TableCell>
                                <TableCell>
                                    {pt.task.startDate ? (
                                        format(new Date(pt.task.startDate), "MMM d, yyyy")
                                    ) : (
                                        <span className="text-muted-foreground text-xs">-</span>
                                    )}
                                </TableCell>
                                <TableCell>
                                    <Badge
                                        variant="outline"
                                        className={cn(
                                            "text-xs font-medium",
                                            getStatusColors(pt.task.status as any).color,
                                            getStatusColors(pt.task.status as any).bgColor,
                                            getStatusColors(pt.task.status as any).borderColor
                                        )}
                                    >
                                        {getStatusLabel(pt.task.status as any)}
                                    </Badge>
                                </TableCell>
                                <TableCell className="text-right">
                                    {isIndentCreated ? (
                                        <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                                            Indent Created
                                        </Badge>
                                    ) : (
                                        <CreateIndentDialog
                                            workspaceId={workspaceId}
                                            projects={projects}
                                            tasks={tasks}
                                            materials={materials}
                                            units={units}
                                            vendors={vendors}
                                            userRole={userRole}
                                            defaultProjectId={pt.projectId}
                                            defaultTaskId={pt.taskId}
                                            workspaceMembers={workspaceMembers}
                                            currentMemberId={currentMemberId}
                                            trigger={
                                                <Button size="icon" variant="ghost" className="h-8 w-8 text-muted-foreground hover:text-primary">
                                                    <IconPlus className="h-4 w-4" />
                                                </Button>
                                            }
                                        />
                                    )}
                                </TableCell>
                            </TableRow>
                        )
                    })}
                </TableBody>
            </Table>
        </div>
    );
}
