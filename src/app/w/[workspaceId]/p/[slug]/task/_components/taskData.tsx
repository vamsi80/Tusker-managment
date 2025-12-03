"use client";

import React, { useState, useEffect } from "react";
import {
    DndContext,
    closestCenter,
    KeyboardSensor,
    PointerSensor,
    useSensor,
    useSensors,
    DragEndEvent,
} from "@dnd-kit/core";
import {
    arrayMove,
    SortableContext,
    sortableKeyboardCoordinates,
    verticalListSortingStrategy,
    useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
    ChevronDown,
    ChevronRight,
    MoreHorizontal,
    GripVertical,
    Calendar,
    Tag,
} from "lucide-react";
import { ProjectTaskType } from "@/app/data/task/get-project-tasks";
import { ProjectMembersType } from "@/app/data/project/get-project-members";
import { CreateSubTaskForm } from "./create-subTask-form";

interface TaskDataProps {
    tasks: ProjectTaskType;
    members: ProjectMembersType;
    workspaceId: string;
    projectId: string;
    canCreateSubTask: boolean;
}

export function TaskData({
    tasks: initialTasks,
    members,
    workspaceId,
    projectId,
    canCreateSubTask,
}: TaskDataProps) {
    const [tasks, setTasks] = useState<ProjectTaskType>(initialTasks);
    const [expanded, setExpanded] = useState<Record<string, boolean>>({});

    useEffect(() => {
        setTasks(initialTasks);
    }, [initialTasks]);

    const toggleExpand = (taskId: string) => {
        setExpanded((prev) => ({ ...prev, [taskId]: !prev[taskId] }));
    };

    const handleDragEnd = (event: DragEndEvent) => {
        const { active, over } = event;

        if (!over || active.id === over.id) {
            return;
        }

        // Find the parent task for the active subtask
        const activeSubTaskId = active.id as string;
        const overSubTaskId = over.id as string;

        const parentTask = tasks.find((task) =>
            task.subTasks.some((sub) => sub.id === activeSubTaskId)
        );

        if (!parentTask) return;

        // Ensure we are dragging within the same parent (optional restriction, but good for now)
        const isOverInSameParent = parentTask.subTasks.some(
            (sub) => sub.id === overSubTaskId
        );

        if (isOverInSameParent) {
            const oldIndex = parentTask.subTasks.findIndex(
                (sub) => sub.id === activeSubTaskId
            );
            const newIndex = parentTask.subTasks.findIndex(
                (sub) => sub.id === overSubTaskId
            );

            const newSubTasks = arrayMove(parentTask.subTasks, oldIndex, newIndex);

            const newTasks = tasks.map((t) => {
                if (t.id === parentTask.id) {
                    return { ...t, subTasks: newSubTasks };
                }
                return t;
            });

            setTasks(newTasks);
            // TODO: Call server action to save new order
        }
    };

    const sensors = useSensors(
        useSensor(PointerSensor),
        useSensor(KeyboardSensor, {
            coordinateGetter: sortableKeyboardCoordinates,
        })
    );

    return (
        <div className="rounded-md border">
            <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleDragEnd}
            >
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead className="w-[50px]"></TableHead>
                            <TableHead className="w-[300px]">Task Name</TableHead>
                            <TableHead>Assignee</TableHead>
                            <TableHead>Due Date</TableHead>
                            <TableHead>Tag</TableHead>
                            <TableHead className="w-[50px]"></TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {tasks.map((task) => (
                            <React.Fragment key={task.id}>
                                <TaskRow
                                    task={task}
                                    isExpanded={!!expanded[task.id]}
                                    onToggleExpand={() => toggleExpand(task.id)}
                                />
                                {expanded[task.id] && (
                                    <SubTaskList
                                        task={task}
                                        members={members}
                                        workspaceId={workspaceId}
                                        projectId={projectId}
                                        canCreateSubTask={canCreateSubTask}
                                    />
                                )}
                            </React.Fragment>
                        ))}
                        {tasks.length === 0 && (
                            <TableRow>
                                <TableCell colSpan={6} className="h-24 text-center">
                                    No tasks found.
                                </TableCell>
                            </TableRow>
                        )}
                    </TableBody>
                </Table>
            </DndContext>
        </div>
    );
}

function TaskRow({
    task,
    isExpanded,
    onToggleExpand,
}: {
    task: ProjectTaskType[number];
    isExpanded: boolean;
    onToggleExpand: () => void;
}) {
    // Correct path: task.assignee is ProjectMember, which has workspaceMember, which has user
    const assignee = task.assignee?.workspaceMember?.user;

    return (
        <TableRow className="group">
            <TableCell>
                <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={onToggleExpand}
                >
                    {isExpanded ? (
                        <ChevronDown className="h-4 w-4" />
                    ) : (
                        <ChevronRight className="h-4 w-4" />
                    )}
                </Button>
            </TableCell>
            <TableCell className="font-medium">
                <div className="flex items-center gap-2">
                    {task.name}
                    <Badge variant="outline" className="text-xs font-normal text-muted-foreground">
                        {task.subTasks.length} subtasks
                    </Badge>
                </div>
            </TableCell>
            <TableCell>
                {assignee ? (
                    <div className="flex items-center gap-2">
                        <Avatar className="h-6 w-6">
                            <AvatarImage src={assignee.image || ""} />
                            <AvatarFallback>{assignee.name?.[0]}</AvatarFallback>
                        </Avatar>
                        <span className="text-sm text-muted-foreground">
                            {assignee.name}
                        </span>
                    </div>
                ) : (
                    <span className="text-sm text-muted-foreground">Unassigned</span>
                )}
            </TableCell>
            <TableCell>
                {task.dueDate ? (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Calendar className="h-3.5 w-3.5" />
                        {new Date(task.dueDate).toLocaleDateString()}
                    </div>
                ) : (
                    <span className="text-muted-foreground">-</span>
                )}
            </TableCell>
            <TableCell>
                {task.tag ? (
                    <Badge variant="secondary" className="rounded-md">
                        {task.tag}
                    </Badge>
                ) : (
                    <span className="text-muted-foreground">-</span>
                )}
            </TableCell>
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

function SubTaskList({
    task,
    members,
    workspaceId,
    projectId,
    canCreateSubTask,
}: {
    task: ProjectTaskType[number];
    members: ProjectMembersType;
    workspaceId: string;
    projectId: string;
    canCreateSubTask: boolean;
}) {
    return (
        <SortableContext
            items={task.subTasks.map((sub) => sub.id)}
            strategy={verticalListSortingStrategy}
        >
            {task.subTasks.map((subTask) => (
                <SubTaskRow key={subTask.id} subTask={subTask} />
            ))}
            <TableRow className="bg-muted/30 hover:bg-muted/30">
                <TableCell colSpan={6} className="p-2 pl-12">
                    {canCreateSubTask && (
                        <CreateSubTaskForm
                            members={members}
                            workspaceId={workspaceId}
                            projectId={projectId}
                            parentTaskId={task.id}
                        />
                    )}
                </TableCell>
            </TableRow>
        </SortableContext>
    );
}

function SubTaskRow({ subTask }: { subTask: ProjectTaskType[number]["subTasks"][number] }) {
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging,
    } = useSortable({ id: subTask.id });

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        zIndex: isDragging ? 10 : "auto",
        opacity: isDragging ? 0.5 : 1,
    };

    const assignee = subTask.assignee?.workspaceMember?.user;

    return (
        <TableRow
            ref={setNodeRef}
            style={style}
            className="bg-muted/10 hover:bg-muted/20"
        >
            <TableCell className="pl-4">
                <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 cursor-grab active:cursor-grabbing"
                    {...attributes}
                    {...listeners}
                >
                    <GripVertical className="h-3.5 w-3.5 text-muted-foreground" />
                </Button>
            </TableCell>
            <TableCell className="pl-10">
                <span className="text-sm">{subTask.name}</span>
            </TableCell>
            <TableCell>
                {assignee ? (
                    <div className="flex items-center gap-2">
                        <Avatar className="h-5 w-5">
                            <AvatarImage src={assignee.image || ""} />
                            <AvatarFallback className="text-[10px]">{assignee.name?.[0]}</AvatarFallback>
                        </Avatar>
                        <span className="text-xs text-muted-foreground">
                            {assignee.name}
                        </span>
                    </div>
                ) : (
                    <span className="text-xs text-muted-foreground">Unassigned</span>
                )}
            </TableCell>
            <TableCell>
                {subTask.dueDate ? (
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Calendar className="h-3 w-3" />
                        {new Date(subTask.dueDate).toLocaleDateString()}
                    </div>
                ) : (
                    <span className="text-muted-foreground text-xs">-</span>
                )}
            </TableCell>
            <TableCell>
                {subTask.tag ? (
                    <div className="flex items-center gap-1">
                        <Tag className="h-3 w-3 text-muted-foreground" />
                        <span className="text-xs text-muted-foreground">{subTask.tag}</span>
                    </div>
                ) : (
                    <span className="text-muted-foreground text-xs">-</span>
                )}
            </TableCell>
            <TableCell>
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-7 w-7">
                            <MoreHorizontal className="h-3.5 w-3.5" />
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