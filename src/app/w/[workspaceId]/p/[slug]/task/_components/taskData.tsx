"use client";

import React, { useState, useEffect } from "react";
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, DragEndEvent, } from "@dnd-kit/core";
import { arrayMove, SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy, useSortable, } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger, } from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { ChevronDown, ChevronRight, MoreHorizontal, GripVertical, Calendar, Tag, Filter, Settings2, X, CornerDownRight, Loader2, ChevronsDown } from "lucide-react";
import { ProjectTasksResponse, ProjectTaskType, SubTaskType, getProjectTasks, getTaskSubTasks } from "@/app/data/task/get-project-tasks";
import { ProjectMembersType } from "@/app/data/project/get-project-members";
import { CreateSubTaskForm } from "./create-subTask-form";

interface TaskDataProps {
    initialTasksData: ProjectTasksResponse;
    members: ProjectMembersType;
    workspaceId: string;
    projectId: string;
    canCreateSubTask: boolean;
}

type ColumnVisibility = {
    assignee: boolean;
    dueDate: boolean;
    tag: boolean;
};

type TaskWithSubTasks = ProjectTaskType[number] & {
    subTasks?: SubTaskType;
    subTasksHasMore?: boolean;
    subTasksPage?: number;
};

export function TaskData({
    initialTasksData,
    members,
    workspaceId,
    projectId,
    canCreateSubTask,
}: TaskDataProps) {
    const [tasks, setTasks] = useState<TaskWithSubTasks[]>(initialTasksData.tasks);
    const [currentPage, setCurrentPage] = useState(initialTasksData.currentPage);
    const [hasMoreTasks, setHasMoreTasks] = useState(initialTasksData.hasMore);
    const [loadingMoreTasks, setLoadingMoreTasks] = useState(false);

    const [expanded, setExpanded] = useState<Record<string, boolean>>({});
    const [loadingSubTasks, setLoadingSubTasks] = useState<Record<string, boolean>>({});
    const [loadingMoreSubTasks, setLoadingMoreSubTasks] = useState<Record<string, boolean>>({});

    const [searchQuery, setSearchQuery] = useState("");
    const [tagFilter, setTagFilter] = useState<string | null>(null);
    const [columnVisibility, setColumnVisibility] = useState<ColumnVisibility>({
        assignee: true,
        dueDate: true,
        tag: true,
    });

    const loadMoreTasks = async () => {
        setLoadingMoreTasks(true);
        try {
            const nextPage = currentPage + 1;
            const result = await getProjectTasks(projectId, nextPage, 10);

            setTasks((prev) => [...prev, ...result.tasks]);
            setCurrentPage(nextPage);
            setHasMoreTasks(result.hasMore);
        } catch (error) {
            console.error("Error loading more tasks:", error);
        } finally {
            setLoadingMoreTasks(false);
        }
    };

    const toggleExpand = async (taskId: string) => {
        const isCurrentlyExpanded = expanded[taskId];

        setExpanded((prev) => ({ ...prev, [taskId]: !prev[taskId] }));

        if (!isCurrentlyExpanded) {
            const task = tasks.find((t) => t.id === taskId);
            if (task && !task.subTasks) {
                setLoadingSubTasks((prev) => ({ ...prev, [taskId]: true }));

                try {
                    const result = await getTaskSubTasks(taskId, 1, 10);

                    setTasks((prevTasks) =>
                        prevTasks.map((t) =>
                            t.id === taskId
                                ? {
                                    ...t,
                                    subTasks: result.subTasks,
                                    subTasksHasMore: result.hasMore,
                                    subTasksPage: 1,
                                }
                                : t
                        )
                    );
                } catch (error) {
                    console.error("Error loading subtasks:", error);
                } finally {
                    setLoadingSubTasks((prev) => ({ ...prev, [taskId]: false }));
                }
            }
        }
    };

    const loadMoreSubTasks = async (taskId: string) => {
        const task = tasks.find((t) => t.id === taskId);
        if (!task || !task.subTasks) return;

        setLoadingMoreSubTasks((prev) => ({ ...prev, [taskId]: true }));

        try {
            const nextPage = (task.subTasksPage || 1) + 1;
            const result = await getTaskSubTasks(taskId, nextPage, 10);

            setTasks((prevTasks) =>
                prevTasks.map((t) =>
                    t.id === taskId
                        ? {
                            ...t,
                            subTasks: [...(t.subTasks || []), ...result.subTasks],
                            subTasksHasMore: result.hasMore,
                            subTasksPage: nextPage,
                        }
                        : t
                )
            );
        } catch (error) {
            console.error("Error loading more subtasks:", error);
        } finally {
            setLoadingMoreSubTasks((prev) => ({ ...prev, [taskId]: false }));
        }
    };

    const handleDragEnd = (event: DragEndEvent) => {
        const { active, over } = event;

        if (!over || active.id === over.id) {
            return;
        }

        const activeSubTaskId = active.id as string;
        const overSubTaskId = over.id as string;

        const parentTask = tasks.find((task) =>
            task.subTasks?.some((sub) => sub.id === activeSubTaskId)
        );

        if (!parentTask || !parentTask.subTasks) return;

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

    // Filter tasks based on search and tag
    const filteredTasks = tasks.filter((task) => {
        const matchesSearch = task.name.toLowerCase().includes(searchQuery.toLowerCase());
        const matchesTag = !tagFilter || task.tag === tagFilter;
        return matchesSearch && matchesTag;
    });

    // Get unique tags for filter
    const uniqueTags = Array.from(new Set(tasks.map((t) => t.tag).filter(Boolean)));

    const toggleColumn = (column: keyof ColumnVisibility) => {
        setColumnVisibility((prev) => ({ ...prev, [column]: !prev[column] }));
    };

    return (
        <div className="space-y-4">
            {/* Filters and Controls */}
            <div className="flex items-center gap-3">
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
                            <DropdownMenuItem key={tag} onClick={() => setTagFilter(tag!)}>
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
                            checked={columnVisibility.assignee}
                            onCheckedChange={() => toggleColumn("assignee")}
                        >
                            Assignee
                        </DropdownMenuCheckboxItem>
                        <DropdownMenuCheckboxItem
                            checked={columnVisibility.dueDate}
                            onCheckedChange={() => toggleColumn("dueDate")}
                        >
                            Due Date
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

            {/* Table */}
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
                                <TableHead className="min-w-[400px]">Task Name</TableHead>
                                {columnVisibility.assignee && <TableHead className="w-[200px]">Assignee</TableHead>}
                                {columnVisibility.dueDate && <TableHead className="w-[180px]">Due Date</TableHead>}
                                {columnVisibility.tag && <TableHead className="w-[150px]">Tag</TableHead>}
                                <TableHead className="w-[50px]"></TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {filteredTasks.map((task) => (
                                <React.Fragment key={task.id}>
                                    <TaskRow
                                        task={task}
                                        isExpanded={!!expanded[task.id]}
                                        isLoading={!!loadingSubTasks[task.id]}
                                        onToggleExpand={() => toggleExpand(task.id)}
                                        columnVisibility={columnVisibility}
                                    />
                                    {expanded[task.id] && (
                                        <SubTaskList
                                            task={task}
                                            members={members}
                                            workspaceId={workspaceId}
                                            projectId={projectId}
                                            canCreateSubTask={canCreateSubTask}
                                            columnVisibility={columnVisibility}
                                            isLoading={!!loadingSubTasks[task.id]}
                                            isLoadingMore={!!loadingMoreSubTasks[task.id]}
                                            onLoadMore={() => loadMoreSubTasks(task.id)}
                                        />
                                    )}
                                </React.Fragment>
                            ))}
                            {filteredTasks.length === 0 && (
                                <TableRow>
                                    <TableCell colSpan={6} className="h-24 text-center">
                                        No tasks found.
                                    </TableCell>
                                </TableRow>
                            )}

                            {/* Load More Tasks Button */}
                            {hasMoreTasks && (
                                <TableRow>
                                    <TableCell colSpan={6} className="text-center p-4">
                                        <Button
                                            variant="outline"
                                            onClick={loadMoreTasks}
                                            disabled={loadingMoreTasks}
                                            className="w-full"
                                        >
                                            {loadingMoreTasks ? (
                                                <>
                                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                                    Loading more tasks...
                                                </>
                                            ) : (
                                                <>
                                                    <ChevronsDown className="mr-2 h-4 w-4" />
                                                    Load More Tasks
                                                </>
                                            )}
                                        </Button>
                                    </TableCell>
                                </TableRow>
                            )}
                        </TableBody>
                    </Table>
                </DndContext>
            </div>
        </div>
    );
}

function TaskRow({
    task,
    isExpanded,
    isLoading,
    onToggleExpand,
    columnVisibility,
}: {
    task: TaskWithSubTasks;
    isExpanded: boolean;
    isLoading: boolean;
    onToggleExpand: () => void;
    columnVisibility: ColumnVisibility;
}) {
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

function SubTaskList({
    task,
    members,
    workspaceId,
    projectId,
    canCreateSubTask,
    columnVisibility,
    isLoading,
    isLoadingMore,
    onLoadMore,
}: {
    task: TaskWithSubTasks;
    members: ProjectMembersType;
    workspaceId: string;
    projectId: string;
    canCreateSubTask: boolean;
    columnVisibility: ColumnVisibility;
    isLoading: boolean;
    isLoadingMore: boolean;
    onLoadMore: () => void;
}) {
    const visibleColumnsCount = 2 + Object.values(columnVisibility).filter(Boolean).length + 1;

    if (isLoading) {
        return (
            <TableRow className="bg-muted/10">
                <TableCell colSpan={visibleColumnsCount} className="p-4">
                    <div className="flex items-center justify-center gap-2">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        <span className="text-sm text-muted-foreground">Loading subtasks...</span>
                    </div>
                </TableCell>
            </TableRow>
        );
    }

    if (!task.subTasks || task.subTasks.length === 0) {
        return (
            <TableRow className="bg-muted/30 hover:bg-muted/30">
                <TableCell colSpan={visibleColumnsCount} className="p-2 pl-12">
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
        );
    }

    return (
        <>
            <SortableContext
                items={task.subTasks.map((sub) => sub.id)}
                strategy={verticalListSortingStrategy}
            >
                {task.subTasks.map((subTask) => (
                    <SubTaskRow
                        key={subTask.id}
                        subTask={subTask}
                        columnVisibility={columnVisibility}
                    />
                ))}
            </SortableContext>

            {/* Load More Subtasks Button */}
            {task.subTasksHasMore && (
                <TableRow className="bg-muted/10">
                    <TableCell colSpan={visibleColumnsCount} className="p-2 pl-12">
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={onLoadMore}
                            disabled={isLoadingMore}
                            className="w-full"
                        >
                            {isLoadingMore ? (
                                <>
                                    <Loader2 className="mr-2 h-3 w-3 animate-spin" />
                                    Loading more subtasks...
                                </>
                            ) : (
                                <>
                                    <ChevronsDown className="mr-2 h-3 w-3" />
                                    Load More Subtasks
                                </>
                            )}
                        </Button>
                    </TableCell>
                </TableRow>
            )}

            <TableRow className="bg-muted/30 hover:bg-muted/30">
                <TableCell colSpan={visibleColumnsCount} className="p-2 pl-12">
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
        </>
    );
}

function SubTaskRow({
    subTask,
    columnVisibility,
}: {
    subTask: SubTaskType[number];
    columnVisibility: ColumnVisibility;
}) {
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
            <TableCell className="pl-3">
                <div className="flex items-center gap-2">
                    <CornerDownRight className="h-4 w-4 text-muted-foreground shrink-0" />
                    <span className="text-sm">{subTask.name}</span>
                </div>
            </TableCell>
            {columnVisibility.assignee && (
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
            )}
            {columnVisibility.dueDate && (
                <TableCell>
                    {subTask.dueDate ? (
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <Calendar className="h-3 w-3" />
                            {new Date(subTask.dueDate).toLocaleDateString('en-GB')}
                        </div>
                    ) : (
                        <span className="text-muted-foreground text-xs">-</span>
                    )}
                </TableCell>
            )}
            {columnVisibility.tag && (
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
            )}
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