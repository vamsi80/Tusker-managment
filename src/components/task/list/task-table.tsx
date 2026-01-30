"use client";

import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { SubTaskList } from "./subtask-list";
import { Button } from "@/components/ui/button";
import React, { useState, useEffect, useMemo, useRef } from "react";
import { Loader2, Plus, ChevronsUpDown, Maximize2, Minimize2 } from "lucide-react";
import { loadMoreTasksAction, loadMoreTasksFlatAction, loadSubTasksAction, loadSubTasksBatchAction } from "@/actions/task/list-actions";
import { updateSubtaskPositions } from "@/actions/task/gantt";
import { useSubTaskSheet } from "@/contexts/subtask-sheet-context";
import { TableCell, TableRow } from "@/components/ui/table";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { ProjectMembersType } from "@/data/project/get-project-members";
import { SubTaskType } from "@/data/task/list/get-subtasks";
import { arrayMove, sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, DragEndEvent } from "@dnd-kit/core";
import { TaskWithSubTasks } from "@/components/task/shared/types";
import { TaskRow } from "./task-row";
import { TaskFilters } from "../shared/types";
import { GlobalFilterToolbar } from "../shared/global-filter-toolbar";
import { ColumnVisibility } from "../shared/column-visibility";
import { extractAllFilterOptions } from "@/lib/utils/extract-filter-options";
import { InlineTaskForm } from "./inline-task-form";
import { ProjectRow } from "./project-row";
import { UserPermissionsType } from "@/data/user/get-user-permissions";

interface TaskTableProps {
    initialTasks: TaskWithSubTasks[];
    initialHasMore: boolean;
    initialTotalCount?: number; // Total count of tasks for display
    members: ProjectMembersType;
    assignees?: Array<{ id: string; name: string; surname?: string }>;
    workspaceId: string;
    projectId: string;
    canCreateSubTask: boolean;
    showAdvancedFilters?: boolean;
    tags?: { id: string; name: string; }[];
    projects?: { id: string; name: string; canManageMembers?: boolean; color?: string }[];
    leadProjectIds?: string[];
    isWorkspaceAdmin?: boolean;
    level?: "workspace" | "project";
    permissions?: UserPermissionsType;
    userId?: string;
}

const DEFAULT_TAGS: { id: string; name: string; }[] = [];
const DEFAULT_PROJECTS: { id: string; name: string; }[] = [];

export function TaskTable({
    initialTasks,
    members,
    assignees,
    workspaceId,
    projectId,
    canCreateSubTask,
    showAdvancedFilters = false,
    tags = DEFAULT_TAGS,
    projects = DEFAULT_PROJECTS,
    leadProjectIds = [],
    isWorkspaceAdmin = false,
    level = "project",
    permissions,
    userId,
}: TaskTableProps) {
    const [tasks, setTasks] = useState<TaskWithSubTasks[]>(initialTasks);
    // Project-First Pagination State
    // keys: projectId, values: pagination info
    const [projectPagination, setProjectPagination] = useState<Record<string, { page: number; hasMore: boolean; isLoading: boolean }>>({});

    const [searchQuery, setSearchQuery] = useState("");
    const [filters, setFilters] = useState<TaskFilters>({});
    const [isLoadingFilters, setIsLoadingFilters] = useState(false);
    const [expanded, setExpanded] = useState<Record<string, boolean>>({});
    const [loadingSubTasks, setLoadingSubTasks] = useState<Record<string, boolean>>({});
    const [loadingMoreSubTasks, setLoadingMoreSubTasks] = useState<Record<string, boolean>>({});
    const [updatingTaskId, setUpdatingTaskId] = useState<string | null>(null);
    const [expandedProjects, setExpandedProjects] = useState<Record<string, boolean>>({});

    const subTasksCacheRef = useRef<Record<string, { subTasks: SubTaskType[]; hasMore: boolean; page: number }>>({});
    const observerRef = useRef<IntersectionObserver | null>(null);
    const loadProjectTasksRef = useRef<((id: string) => Promise<void>) | null>(null);
    const autoExpandRef = useRef(false);

    // Keep ref updated


    // Cleanup observer
    useEffect(() => {
        return () => observerRef.current?.disconnect();
    }, []);

    const getObserver = () => {
        if (!observerRef.current) {
            observerRef.current = new IntersectionObserver((entries) => {
                entries.forEach((entry) => {
                    if (entry.isIntersecting) {
                        const projectId = (entry.target as HTMLElement).dataset.projectId;
                        if (projectId && loadProjectTasksRef.current) {
                            loadProjectTasksRef.current(projectId);
                        }
                    }
                });
            }, { rootMargin: "200px" });
        }
        return observerRef.current;
    };

    useEffect(() => {
        subTasksCacheRef.current = {};
        setExpanded({});
        // Reset pagination when filters/search change
        setProjectPagination({});
        // Note: We might want to clear tasks too if we want fresh results, 
        // but that happens via setFilters/Search usually triggering data refresh?
        // In this architecture, setFilters should probably clear tasks.
        if (Object.keys(filters).length > 0 || searchQuery) {
            setTasks([]);
        }
    }, [filters, searchQuery]);

    // Auto-expand all projects when groups change? No, we want lazy load.
    // We remove the old auto-expand logic which might force loading.

    const [activeInlineProjectId, setActiveInlineProjectId] = useState<string | null>(null);
    const [filteredProjects, setFilteredProjects] = useState<{ id: string; name: string; }[]>(projects || []);
    const totalCount = tasks.length;

    // Load Tasks for a specific Project
    const loadProjectTasks = async (targetProjectId: string) => {
        const currentPagination = projectPagination[targetProjectId] || { page: 0, hasMore: true, isLoading: false };

        if (currentPagination.isLoading || !currentPagination.hasMore) return;

        setProjectPagination(prev => ({
            ...prev,
            [targetProjectId]: { ...currentPagination, isLoading: true }
        }));

        try {
            const nextPage = currentPagination.page + 1;
            const response = await loadMoreTasksAction(
                workspaceId,
                {
                    ...filters,
                    projectId: targetProjectId, // Scope to this project
                    startDate: filters.startDate ? new Date(filters.startDate) : undefined,
                    endDate: filters.endDate ? new Date(filters.endDate) : undefined,
                    search: searchQuery
                },
                nextPage,
                10 // Page size
            );

            if (response.success && response.data) {
                setTasks(prev => {
                    const existingIds = new Set(prev.map(t => t.id));
                    const newTasks = (response.data!.tasks as unknown as TaskWithSubTasks[])
                        .filter(task => !existingIds.has(task.id));

                    // Auto-expand new tasks if "Expand All" mode is active
                    if (autoExpandRef.current && newTasks.length > 0) {
                        // Use setTimeout to avoid conflict with the rendering batch? 
                        // No, state updates are batched usually. But we can just setExpanded.
                        // We need to do it nicely.
                        setTimeout(() => {
                            setExpanded(prevExpanded => {
                                const newExpanded = { ...prevExpanded };
                                newTasks.forEach(t => { newExpanded[t.id] = true; });
                                return newExpanded;
                            });
                        }, 0);
                    }

                    return [...prev, ...newTasks];
                });

                setProjectPagination(prev => ({
                    ...prev,
                    [targetProjectId]: {
                        page: nextPage,
                        hasMore: response.data!.hasMore ?? false,
                        isLoading: false
                    }
                }));
            } else {
                toast.error(response.error || "Failed to load tasks");
                setProjectPagination(prev => ({
                    ...prev,
                    [targetProjectId]: { ...currentPagination, isLoading: false }
                }));
            }
        } catch (error) {
            console.error("Error loading project tasks:", error);
            toast.error("Failed to load project tasks");
            setProjectPagination(prev => ({
                ...prev,
                [targetProjectId]: { ...currentPagination, isLoading: false }
            }));
        }
    };

    // Keep ref updated
    useEffect(() => {
        loadProjectTasksRef.current = loadProjectTasks;
    }, [loadProjectTasks]);

    const toggleProjectExpand = (targetProjectId: string) => {
        setExpandedProjects(prev => {
            const isExpanding = !prev[targetProjectId];

            // Lazy Load: If expanding and not loaded (or strictly if not tracked yet), load first page
            // We use the 'prev' state logic but side-effect must be outside or via callback? 
            // Better to do side effect after state update.
            return {
                ...prev,
                [targetProjectId]: isExpanding
            };
        });

        // Trigger load if expanding and no pagination state exists (never loaded)
        // Check current expanded state? No, check based on intent.
        // We can't access 'isExpanding' computed inside setState here reliably if we use simple toggle.
        // So we reimplement logic:
        const isCurrentlyExpanded = expandedProjects[targetProjectId];
        if (!isCurrentlyExpanded) { // We are about to expand
            if (!projectPagination[targetProjectId]) {
                loadProjectTasks(targetProjectId);
            }
        }
    };

    const handleSubTaskClick = (subTask: SubTaskType) => {
        openSubTaskSheet(subTask);
    };

    // Initialize/Auto-load for Single Project View
    useEffect(() => {
        if (level === 'project' && projectId && !projectPagination[projectId]) {
            loadProjectTasks(projectId);
        }
    }, [level, projectId]);

    const { openSubTaskSheet } = useSubTaskSheet();

    const filterOptions = React.useMemo(() => {
        const options = extractAllFilterOptions(tasks as any, showAdvancedFilters ? 'workspace' : 'project');

        const assigneesForFilter = assignees || members.map(member => ({
            id: member.workspaceMember.user?.id || member.workspaceMember.id,
            name: member.workspaceMember.user.name,
            surname: member.workspaceMember.user.surname || undefined,
        })).sort((a, b) => {
            const nameA = `${a.name} ${a.surname || ''}`.trim();
            const nameB = `${b.name} ${b.surname || ''}`.trim();
            return nameA.localeCompare(nameB);
        });

        return {
            ...options,
            assignees: assigneesForFilter,
            tags: tags,
            projects: filteredProjects,
        };
    }, [tasks, showAdvancedFilters, members, assignees, tags, filteredProjects]);

    const handleSubTaskUpdated = (taskId: string, subTaskId: string, updatedData: Partial<SubTaskType>) => {
        setTasks(prevTasks =>
            prevTasks.map(task => {
                if (task.id === taskId && task.subTasks) {
                    return {
                        ...task,
                        subTasks: task.subTasks.map((subTask: SubTaskType) =>
                            subTask.id === subTaskId
                                ? { ...subTask, ...updatedData }
                                : subTask
                        ),
                    };
                }
                return task;
            })
        );
    };

    const handleSubTaskDeleted = (taskId: string, subTaskId: string) => {
        setTasks(prevTasks =>
            prevTasks.map(task => {
                if (task.id === taskId && task.subTasks) {
                    const newSubTasks = task.subTasks.filter((subTask: SubTaskType) => subTask.id !== subTaskId);
                    return {
                        ...task,
                        subTasks: newSubTasks,
                        _count: {
                            ...task._count,
                            subTasks: newSubTasks.length
                        },
                    };
                }
                return task;
            })
        );
    };

    const handleSubTaskCreated = (taskId: string, newSubTask: any, tempId?: string) => {
        setTasks(prevTasks =>
            prevTasks.map(task => {
                if (task.id === taskId) {
                    const currentSubTasks = task.subTasks || [];

                    if (tempId) {
                        return {
                            ...task,
                            subTasks: currentSubTasks.map((st: SubTaskType) => st.id === tempId ? newSubTask : st)
                        };
                    }

                    if (currentSubTasks.some((st: SubTaskType) => st.id === newSubTask.id)) {
                        return task;
                    }

                    return {
                        ...task,
                        subTasks: [...currentSubTasks, newSubTask],
                        _count: {
                            ...task._count,
                            subTasks: (task._count?.subTasks || 0) + 1
                        },
                    };
                }
                return task;
            })
        );
    };

    // Calculate project task counts
    const projectTaskCounts = useMemo(() => {
        const counts: Record<string, number> = {};
        tasks.forEach(task => {
            const pId = task.projectId || 'unknown';
            counts[pId] = (counts[pId] || 0) + 1;
        });
        return counts;
    }, [tasks]);

    // Calculate grouped tasks - MOVED UP before use
    const filteredTasks = tasks;
    const groupedTasks = useMemo(() => {
        if (level !== "workspace") return null;
        const groups: Record<string, TaskWithSubTasks[]> = {};
        projects.forEach(project => {
            groups[project.id] = [];
        });
        filteredTasks.forEach((task) => {
            const pId = task.projectId;
            if (!groups[pId]) {
                groups[pId] = [];
            }
            groups[pId].push(task);
        });
        return groups;
    }, [filteredTasks, level, projects]);

    const [columnVisibility, setColumnVisibility] = useState<ColumnVisibility>({
        assignee: true,
        reviewer: true,
        startDate: true,
        dueDate: true,
        progress: true,
        status: true,
        tag: true,
        description: true,
        project: level === "workspace",
    });

    const visibleColumnsCount = 2 + Object.entries(columnVisibility).filter(([k, v]) => k !== 'project' && v).length + 1;

    // 🔥 MASTER SUBTASK LOADER: The Single Source of Truth
    // Tracks which tasks have been processed (fetched or confirmed empty) to prevent redundant work
    const processedSubTasksRef = useRef<Set<string>>(new Set());
    const fetchingSubTasksRef = useRef<Set<string>>(new Set());

    // 1. Compute Visible Parent Task IDs
    // This is the source of truth for what SHOULD be loaded
    const visibleParentTaskIds = useMemo(() => {
        // Workspace grouped view: Only tasks in expanded projects are visible
        if (groupedTasks && level === 'workspace') {
            return Object.entries(groupedTasks)
                .filter(([projectId]) => expandedProjects[projectId])
                .flatMap(([, tasks]) => tasks.map(t => t.id));
        }

        // Project-level view (or ungrouped): All loaded tasks are effectively visible candidates
        return tasks.map(t => t.id);
    }, [groupedTasks, expandedProjects, tasks, level]);

    // 2. Central Effect to ensure subtasks exist for visible parents
    useEffect(() => {
        if (visibleParentTaskIds.length === 0) return;

        // Identify missing subtasks that haven't been processed or aren't currently fetching
        const missing = visibleParentTaskIds.filter(taskId => {
            // Already processed (loaded or empty)
            if (processedSubTasksRef.current.has(taskId)) return false;
            // Currently fetching
            if (fetchingSubTasksRef.current.has(taskId)) return false;

            const task = tasks.find(t => t.id === taskId);
            if (!task) return false;

            // Optimization: If specialized count check says 0, mark as processed and skip
            if ((task._count?.subTasks ?? 0) === 0) {
                processedSubTasksRef.current.add(taskId);
                return false;
            }

            // If subTasks matches undefined, it needs fetching
            // (Empty array [] means loaded but empty, which is fine)
            return task.subTasks === undefined;
        });

        if (missing.length === 0) return;

        // Mark as fetching immediately to prevent race conditions
        missing.forEach(id => fetchingSubTasksRef.current.add(id));

        // 🚀 BATCH LOAD
        // We do this silently (background) to update the state
        loadSubTasksBatchAction(
            missing,
            workspaceId,
            projectId || undefined,
            {}, // Filters are usually applied at parent level, strict hierarchy for now
            10
        ).then(response => {
            // Cleanup fetching status
            missing.forEach(id => fetchingSubTasksRef.current.delete(id));

            if (response.success && response.data) {
                // Update Cache and Processed Status
                response.data.forEach(result => {
                    processedSubTasksRef.current.add(result.parentTaskId);

                    // Deduplicate
                    const seenIds = new Set<string>();
                    const uniqueSubTasks = result.subTasks.filter(st => {
                        if (!st.id || seenIds.has(st.id)) return false;
                        seenIds.add(st.id);
                        return true;
                    });

                    subTasksCacheRef.current[result.parentTaskId] = {
                        subTasks: uniqueSubTasks,
                        hasMore: result.hasMore,
                        page: 1,
                    };
                });

                // Update React State
                setTasks(prevTasks => prevTasks.map(t => {
                    const cached = subTasksCacheRef.current[t.id];
                    // Only update tasks that were missing and now have data
                    if (missing.includes(t.id) && cached) {
                        return {
                            ...t,
                            subTasks: cached.subTasks,
                            subTasksHasMore: cached.hasMore,
                            subTasksPage: 1
                        };
                    }
                    return t;
                }));
            }
        }).catch(err => {
            console.error("Auto-load subtasks failed", err);
            // Ensure we remove fetching status on error too so it can retry
            missing.forEach(id => fetchingSubTasksRef.current.delete(id));
        });

    }, [visibleParentTaskIds, tasks, workspaceId, projectId]);


    // 3. UI-ONLY Toggle
    const toggleExpand = (taskId: string) => {
        setExpanded(prev => ({ ...prev, [taskId]: !prev[taskId] }));
    };

    // 4. UI-ONLY Expand All
    // 4. UI-ONLY Expand All + Trigger Load
    const handleExpandAll = () => {
        autoExpandRef.current = true;

        // Expand all projects
        const allProjectIds = projects.map(p => p.id);
        const allProjects = allProjectIds.reduce((acc, pId) => ({ ...acc, [pId]: true }), {});
        setExpandedProjects(allProjects);

        // Load tasks for all unloaded projects (Project-First)
        allProjectIds.forEach(id => {
            if (!projectPagination[id]) {
                loadProjectTasks(id);
            }
        });

        // Expand all LOADED tasks
        // Note: Tasks that load later won't be auto-expanded by this call unless we track "Expand All" intent.
        // For now, this expands what is available.
        const allTasks = tasks.reduce((acc, task) => ({ ...acc, [task.id]: true }), {});
        setExpanded(allTasks);
    };

    const handleCollapseAll = () => {
        autoExpandRef.current = false;
        // Collapse all tasks
        setExpanded({});
        // Collapse all projects
        setExpandedProjects({});
    };

    const loadMoreSubTasks = async (taskId: string) => {
        const task = tasks.find((t) => t.id === taskId);
        if (!task || !task.subTasks) return;

        setLoadingMoreSubTasks((prev) => ({ ...prev, [taskId]: true }));

        try {
            const nextPage = (task.subTasksPage || 1) + 1;
            const cleanFilters: any = {};
            const rawFilters = {
                ...filters,
                startDate: filters.startDate ? new Date(filters.startDate) : undefined,
                endDate: filters.endDate ? new Date(filters.endDate) : undefined,
                search: searchQuery || undefined
            };
            Object.keys(rawFilters).forEach(key => {
                // @ts-ignore
                const value = rawFilters[key];
                if (value !== undefined && value !== null && value !== '') {
                    cleanFilters[key] = value;
                }
            });

            const response = await loadSubTasksAction(
                taskId,
                workspaceId,
                task.projectId || projectId,
                cleanFilters,
                nextPage,
                10
            );

            if (response.success && response.data) {
                // Deduplicate: combine existing + new subtasks, remove duplicates
                const existingSubTasks = task.subTasks || [];
                const existingIds = new Set(existingSubTasks.map(st => st.id));
                const newSubTasks = response.data.subTasks.filter(st =>
                    st.id && !existingIds.has(st.id)
                );
                const combinedSubTasks = [...existingSubTasks, ...newSubTasks];

                // Update cache
                subTasksCacheRef.current[taskId] = {
                    subTasks: combinedSubTasks,
                    hasMore: response.data.hasMore,
                    page: nextPage,
                };

                setTasks((prevTasks) =>
                    prevTasks.map((t) =>
                        t.id === taskId
                            ? {
                                ...t,
                                subTasks: combinedSubTasks,
                                subTasksHasMore: response.data!.hasMore,
                                subTasksPage: nextPage,
                            }
                            : t
                    )
                );
            } else {
                toast.error(response.error || "Failed to load more subtasks");
            }
        } catch (error) {
            console.error("Error loading more subtasks:", error);
            toast.error("Failed to load more subtasks");
        } finally {
            setLoadingMoreSubTasks((prev) => ({ ...prev, [taskId]: false }));
        }
    };

    const handleDragEnd = async (event: DragEndEvent) => {
        const { active, over } = event;

        if (!over || active.id === over.id) return;

        const activeSubTaskId = active.id as string;
        const overSubTaskId = over.id as string;

        const parentTask = tasks.find((task) =>
            task.subTasks?.some((sub: SubTaskType) => sub.id === activeSubTaskId)
        );

        if (!parentTask || !parentTask.subTasks) return;

        const isOverInSameParent = parentTask.subTasks.some(
            (sub: SubTaskType) => sub.id === overSubTaskId
        );

        if (isOverInSameParent) {
            const oldIndex = parentTask.subTasks.findIndex(
                (sub: SubTaskType) => sub.id === activeSubTaskId
            );
            const newIndex = parentTask.subTasks.findIndex(
                (sub: SubTaskType) => sub.id === overSubTaskId
            );
            const newSubTasks = arrayMove(parentTask.subTasks, oldIndex, newIndex) as SubTaskType[];
            const updatedSubTasks = newSubTasks.map((subtask: SubTaskType, index: number) => ({
                ...subtask,
                position: index
            }));
            const newTasks = tasks.map((t) => {
                if (t.id === parentTask.id) {
                    return { ...t, subTasks: updatedSubTasks };
                }
                return t;
            });

            setTasks(newTasks);
            const toastId = toast.loading("Updating subtask order...");

            try {
                const updates = updatedSubTasks.map((subtask, index) => ({
                    subtaskId: subtask.id,
                    newPosition: index
                }));

                const result = await updateSubtaskPositions(
                    parentTask.id,
                    projectId,
                    workspaceId,
                    updates
                );

                if (result.success) {
                    toast.success("Subtask order updated successfully", { id: toastId });
                } else {
                    setTasks(tasks);
                    toast.error(result.message || "Failed to update subtask order", { id: toastId });
                }
            } catch (error) {
                console.error("Error updating subtask positions:", error);
                setTasks(tasks);
                toast.error("Failed to update subtask order", { id: toastId });
            }
        }
    };

    const sensors = useSensors(
        useSensor(PointerSensor),
        useSensor(KeyboardSensor, {
            coordinateGetter: sortableKeyboardCoordinates,
        })
    );

    // Helper function to check if any filters are active
    const hasActiveFilters = (filters: TaskFilters): boolean => {
        return !!(
            filters.status ||
            filters.assigneeId ||
            filters.tagId ||
            filters.startDate ||
            filters.endDate ||
            filters.projectId
        );
    };





    return (
        <div className="space-y-4 mt-4">
            <div className="flex items-center gap-2 mb-4">
                <GlobalFilterToolbar
                    className="flex-1"
                    level={showAdvancedFilters ? "workspace" : "project"}
                    view="list"
                    filters={filters}
                    searchQuery={searchQuery}
                    projects={filterOptions.projects}
                    members={filterOptions.assignees}
                    tags={filterOptions.tags}
                    onFilterChange={setFilters}
                    onSearchChange={setSearchQuery}
                    onClearAll={() => {
                        setFilters({});
                        setSearchQuery("");
                    }}
                    columnVisibility={columnVisibility}
                    setColumnVisibility={setColumnVisibility}
                />
            </div>


            <div className="rounded-md border overflow-hidden relative">
                {isLoadingFilters && (
                    <div className="absolute inset-0 z-50 flex items-center justify-center bg-background/50 backdrop-blur-sm transition-all duration-300">
                        <div className="flex flex-col items-center gap-2">
                            <Loader2 className="h-8 w-8 animate-spin text-primary" />
                            <span className="text-sm font-medium text-muted-foreground">Filtering...</span>
                        </div>
                    </div>
                )}
                <div className={cn(
                    "max-h-[calc(100vh-280px)] overflow-auto",
                    "[&::-webkit-scrollbar]:w-0.5",
                    "[&::-webkit-scrollbar]:h-1",
                    "[&::-webkit-scrollbar-track]:bg-transparent",
                    "[&::-webkit-scrollbar-thumb]:bg-slate-300",
                    "[&::-webkit-scrollbar-thumb]:rounded-full",
                    "[&::-webkit-scrollbar-thumb]:hover:bg-slate-400"
                )}>
                    <DndContext
                        sensors={sensors}
                        collisionDetection={closestCenter}
                        onDragEnd={handleDragEnd}
                    >
                        <table className="w-full caption-bottom text-sm table-fixed">
                            <thead className="[&_tr]:border-b">
                                <tr className="sticky top-0 z-10 bg-background border-b shadow-sm hover:bg-muted/50">
                                    <th className="text-foreground h-10 px-2 text-left align-middle font-medium whitespace-nowrap w-[50px] bg-background">
                                        <DropdownMenu>
                                            <DropdownMenuTrigger asChild>
                                                <Button variant="ghost" size="icon" className="h-8 w-8 hover:bg-muted">
                                                    <ChevronsUpDown className="h-4 w-4 text-muted-foreground" />
                                                </Button>
                                            </DropdownMenuTrigger>
                                            <DropdownMenuContent align="start">
                                                <DropdownMenuItem onClick={handleExpandAll}>
                                                    <Maximize2 className="mr-2 h-4 w-4" />
                                                    Expand All
                                                </DropdownMenuItem>
                                                <DropdownMenuItem onClick={handleCollapseAll}>
                                                    <Minimize2 className="mr-2 h-4 w-4" />
                                                    Collapse All
                                                </DropdownMenuItem>
                                            </DropdownMenuContent>
                                        </DropdownMenu>
                                    </th>
                                    <th className="text-foreground h-10 px-2 text-left align-middle font-medium whitespace-nowrap w-[250px] bg-background">
                                        <div className="flex items-center gap-2">
                                            <span>Task Name</span>
                                            {totalCount > 0 && (
                                                <span className="text-xs text-muted-foreground font-normal">
                                                    ({totalCount} tasks)
                                                </span>
                                            )}
                                        </div>
                                    </th>
                                    {/* Project column removed (using grouping instead) */}
                                    {columnVisibility.description && <th className="text-foreground h-10 px-2 text-left align-middle font-medium whitespace-nowrap w-[200px] bg-background">Description</th>}
                                    {columnVisibility.assignee && <th className="text-foreground h-10 px-2 text-left align-middle font-medium whitespace-nowrap w-[100px] bg-background">Assignee</th>}
                                    {columnVisibility.reviewer && <th className="text-foreground h-10 px-2 text-left align-middle font-medium whitespace-nowrap w-[100px] bg-background">Reviewer</th>}
                                    {columnVisibility.status && <th className="text-foreground h-10 px-2 text-left align-middle font-medium whitespace-nowrap w-[100px] bg-background">Status</th>}
                                    {columnVisibility.startDate && <th className="text-foreground h-10 px-2 text-left align-middle font-medium whitespace-nowrap w-[100px] bg-background">Start Date</th>}
                                    {columnVisibility.dueDate && <th className="text-foreground h-10 px-2 text-left align-middle font-medium whitespace-nowrap w-[100px] bg-background">Due Date</th>}
                                    {columnVisibility.progress && <th className="text-foreground h-10 px-2 text-left align-middle font-medium whitespace-nowrap w-[100px] bg-background">Progress</th>}
                                    {columnVisibility.tag && <th className="text-foreground h-10 px-2 text-left align-middle font-medium whitespace-nowrap w-[120px] bg-background">Tag</th>}
                                    <th className="text-foreground h-10 px-2 text-left align-middle font-medium whitespace-nowrap w-[50px] bg-background"></th>
                                </tr>
                            </thead>
                            <tbody>
                                {groupedTasks ? (
                                    Object.entries(groupedTasks).map(([projectId, projectTasks]) => {
                                        const project = projects?.find(p => p.id === projectId);
                                        if (projectId === 'unknown' && projectTasks.length === 0) return null;

                                        const isProjectExpanded = expandedProjects[projectId] === true;

                                        return (
                                            <React.Fragment key={projectId}>
                                                <ProjectRow
                                                    project={project || { id: projectId, name: "Unknown Project" }}
                                                    totalTasksCount={projectTaskCounts[projectId]}
                                                    isExpanded={isProjectExpanded}
                                                    onToggle={() => toggleProjectExpand(projectId)}
                                                    colSpan={visibleColumnsCount}
                                                >
                                                    {isProjectExpanded && projectTasks.map((task) => (
                                                        <React.Fragment key={task.id}>
                                                            <TaskRow
                                                                task={task}
                                                                isExpanded={!!expanded[task.id]}
                                                                onToggleExpand={() => toggleExpand(task.id)}
                                                                columnVisibility={columnVisibility}
                                                                isUpdating={updatingTaskId === task.id}
                                                                onUpdateStart={() => setUpdatingTaskId(task.id)}
                                                                onUpdateEnd={() => setUpdatingTaskId(null)}
                                                                onTaskUpdated={(updatedTask) => {
                                                                    setTasks(prevTasks =>
                                                                        prevTasks.map(t =>
                                                                            t.id === task.id
                                                                                ? { ...t, name: updatedTask.name, taskSlug: updatedTask.taskSlug }
                                                                                : t
                                                                        )
                                                                    );
                                                                }}
                                                                onTaskDeleted={(taskId) => {
                                                                    setTasks(prevTasks =>
                                                                        prevTasks.filter(t => t.id !== taskId)
                                                                    );
                                                                }}
                                                                permissions={permissions}
                                                                userId={userId}
                                                                isWorkspaceAdmin={isWorkspaceAdmin}
                                                                leadProjectIds={leadProjectIds}
                                                                projects={projects}
                                                            >
                                                                <SubTaskList
                                                                    task={task}
                                                                    tags={tags}
                                                                    members={members}
                                                                    workspaceId={workspaceId}
                                                                    projectId={task.projectId || projectId}
                                                                    canCreateSubTask={
                                                                        level === 'project'
                                                                            ? canCreateSubTask
                                                                            : (canCreateSubTask && task.projectId ? (
                                                                                leadProjectIds.includes(task.projectId) ||
                                                                                !!isWorkspaceAdmin ||
                                                                                !!projects?.find(p => p.id === task.projectId)?.canManageMembers
                                                                            ) : false)
                                                                    }
                                                                    columnVisibility={columnVisibility}
                                                                    isLoading={!!loadingSubTasks[task.id]}
                                                                    isLoadingMore={!!loadingMoreSubTasks[task.id]}
                                                                    onLoadMore={() => loadMoreSubTasks(task.id)}
                                                                    onSubTaskClick={handleSubTaskClick}
                                                                    onSubTaskUpdated={(subTaskId, updatedData) =>
                                                                        handleSubTaskUpdated(task.id, subTaskId, updatedData)
                                                                    }
                                                                    onSubTaskDeleted={(subTaskId) =>
                                                                        handleSubTaskDeleted(task.id, subTaskId)
                                                                    }
                                                                    onSubTaskCreated={(newSubTask, tempId) =>
                                                                        handleSubTaskCreated(task.id, newSubTask, tempId)
                                                                    }
                                                                    permissions={permissions}
                                                                    userId={userId}
                                                                    isWorkspaceAdmin={isWorkspaceAdmin}
                                                                    leadProjectIds={leadProjectIds}
                                                                    projects={projects}
                                                                    level={level}
                                                                />
                                                            </TaskRow>
                                                        </React.Fragment>
                                                    ))}
                                                    {/* Initial Load Skeletons (when project expanded but no tasks yet) */}
                                                    {isProjectExpanded && projectPagination[projectId]?.isLoading && projectTasks.length === 0 && (
                                                        Array.from({ length: 3 }).map((_, i) => (
                                                            <TableRow key={`skeleton-${projectId}-${i}`}>
                                                                <TableCell colSpan={visibleColumnsCount} className="p-4">
                                                                    <div className="flex items-center gap-4">
                                                                        <Skeleton className="h-4 w-4 rounded" />
                                                                        <div className="flex-1 space-y-2">
                                                                            <Skeleton className="h-4 w-[200px]" />
                                                                        </div>
                                                                        <Skeleton className="h-4 w-[100px]" />
                                                                        <Skeleton className="h-4 w-[80px]" />
                                                                        <Skeleton className="h-4 w-[80px]" />
                                                                    </div>
                                                                </TableCell>
                                                            </TableRow>
                                                        ))
                                                    )}

                                                    {/* Infinite Scroll Sentinel + Loading Skeleton */}
                                                    {isProjectExpanded && projectPagination[projectId]?.hasMore && (
                                                        <TableRow
                                                            ref={(node) => {
                                                                if (node) getObserver().observe(node);
                                                            }}
                                                            data-project-id={projectId}
                                                        >
                                                            <TableCell colSpan={visibleColumnsCount} className="py-2 h-10">
                                                                {projectPagination[projectId]?.isLoading ? (
                                                                    <div className="flex items-center gap-4 px-2 opacity-60">
                                                                        <Skeleton className="h-4 w-4 rounded" />
                                                                        <div className="flex-1">
                                                                            <Skeleton className="h-4 w-[150px]" />
                                                                        </div>
                                                                        <Skeleton className="h-4 w-[100px]" />
                                                                    </div>
                                                                ) : (
                                                                    /* Invisible trigger when idle/waiting for scroll */
                                                                    <div className="h-1 w-full" />
                                                                )}
                                                            </TableCell>
                                                        </TableRow>
                                                    )}
                                                    {isProjectExpanded && canCreateSubTask && !searchQuery && Object.keys(filters).length === 0 && (
                                                        activeInlineProjectId === projectId ? (
                                                            <InlineTaskForm
                                                                workspaceId={workspaceId}
                                                                projectId={projectId}
                                                                projects={projects}
                                                                level={level}
                                                                leadProjectIds={leadProjectIds}
                                                                isWorkspaceAdmin={isWorkspaceAdmin}
                                                                onCancel={() => setActiveInlineProjectId(null)}
                                                                onTaskDeleted={(taskId) => {
                                                                    setTasks(prev => prev.filter(t => t.id !== taskId));
                                                                }}
                                                                onTaskCreated={(task, tempId) => {
                                                                    if (tempId) {
                                                                        setTasks(prev => prev.map(t => t.id === tempId ? task : t));
                                                                    } else {
                                                                        setTasks(prev => [task, ...prev]);
                                                                    }
                                                                    setActiveInlineProjectId(null);
                                                                }}
                                                            />
                                                        ) : (
                                                            <TableRow
                                                                className="hover:bg-muted/20 cursor-pointer h-8"
                                                                onClick={(e) => { e.stopPropagation(); setActiveInlineProjectId(projectId); }}
                                                            >
                                                                <TableCell colSpan={visibleColumnsCount} className="py-2 px-2 pl-8">
                                                                    <div className="flex items-center gap-2 text-primary font-medium hover:text-primary/80 transition-colors">
                                                                        <Plus className="h-4 w-4" />
                                                                        <span>Add Task</span>
                                                                    </div>
                                                                </TableCell>
                                                            </TableRow>
                                                        )
                                                    )}
                                                </ProjectRow>
                                            </React.Fragment>
                                        );
                                    })
                                ) : (
                                    filteredTasks.map((task) => (
                                        <React.Fragment key={task.id}>
                                            <TaskRow
                                                task={task}
                                                isExpanded={!!expanded[task.id]}
                                                onToggleExpand={() => toggleExpand(task.id)}
                                                columnVisibility={columnVisibility}
                                                isUpdating={updatingTaskId === task.id}
                                                onUpdateStart={() => setUpdatingTaskId(task.id)}
                                                onUpdateEnd={() => setUpdatingTaskId(null)}
                                                onTaskUpdated={(updatedTask) => {
                                                    setTasks(prevTasks =>
                                                        prevTasks.map(t =>
                                                            t.id === task.id
                                                                ? { ...t, name: updatedTask.name, taskSlug: updatedTask.taskSlug }
                                                                : t
                                                        )
                                                    );
                                                }}
                                                onTaskDeleted={(taskId) => {
                                                    setTasks(prevTasks =>
                                                        prevTasks.filter(t => t.id !== taskId)
                                                    );
                                                }}
                                                permissions={permissions}
                                                userId={userId}
                                                isWorkspaceAdmin={isWorkspaceAdmin}
                                                leadProjectIds={leadProjectIds}
                                                projects={projects}
                                            >
                                                <SubTaskList
                                                    task={task}
                                                    tags={tags}
                                                    members={members}
                                                    workspaceId={workspaceId}
                                                    projectId={task.projectId || projectId}
                                                    canCreateSubTask={
                                                        level === 'project'
                                                            ? canCreateSubTask
                                                            : (canCreateSubTask && task.projectId ? (
                                                                leadProjectIds.includes(task.projectId) ||
                                                                !!isWorkspaceAdmin ||
                                                                !!projects?.find(p => p.id === task.projectId)?.canManageMembers
                                                            ) : false)
                                                    }
                                                    columnVisibility={columnVisibility}
                                                    isLoading={!!loadingSubTasks[task.id]}
                                                    isLoadingMore={!!loadingMoreSubTasks[task.id]}
                                                    onLoadMore={() => loadMoreSubTasks(task.id)}
                                                    onSubTaskClick={handleSubTaskClick}
                                                    onSubTaskUpdated={(subTaskId, updatedData) =>
                                                        handleSubTaskUpdated(task.id, subTaskId, updatedData)
                                                    }
                                                    onSubTaskDeleted={(subTaskId) =>
                                                        handleSubTaskDeleted(task.id, subTaskId)
                                                    }
                                                    onSubTaskCreated={(newSubTask, tempId) =>
                                                        handleSubTaskCreated(task.id, newSubTask, tempId)
                                                    }
                                                    permissions={permissions}
                                                    userId={userId}
                                                    isWorkspaceAdmin={isWorkspaceAdmin}
                                                    leadProjectIds={leadProjectIds}
                                                    projects={projects}
                                                    level={level}
                                                />
                                            </TaskRow>
                                        </React.Fragment>
                                    ))
                                )}
                                {isLoadingFilters && filteredTasks.length === 0 && (
                                    <TableRow>
                                        <TableCell colSpan={visibleColumnsCount} className="h-32 text-center">
                                            <div className="flex flex-col items-center justify-center gap-2">
                                                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                                                <span className="text-sm text-muted-foreground">Loading tasks...</span>
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                )}

                                {filteredTasks.length === 0 && !isLoadingFilters && (
                                    <TableRow>
                                        <TableCell colSpan={visibleColumnsCount} className="h-24 text-center">
                                            No tasks found.
                                        </TableCell>
                                    </TableRow>
                                )}


                                {canCreateSubTask && !groupedTasks && !hasActiveFilters(filters) && !searchQuery && (
                                    activeInlineProjectId === projectId ? (
                                        <InlineTaskForm
                                            workspaceId={workspaceId}
                                            projectId={projectId}
                                            projects={projects}
                                            level={level}
                                            leadProjectIds={leadProjectIds}
                                            isWorkspaceAdmin={isWorkspaceAdmin}
                                            onCancel={() => setActiveInlineProjectId(null)}
                                            onTaskDeleted={(taskId) => {
                                                setTasks(prev => prev.filter(t => t.id !== taskId));
                                            }}
                                            onTaskCreated={(task, tempId) => {
                                                if (tempId) {
                                                    setTasks(prev => prev.map(t => t.id === tempId ? task : t));
                                                } else {
                                                    setTasks(prev => [task, ...prev]);
                                                }
                                                setActiveInlineProjectId(null);
                                            }}
                                        />
                                    ) : (
                                        <TableRow className="hover:bg-muted/20 cursor-pointer h-8" onClick={() => setActiveInlineProjectId(projectId)}>
                                            <TableCell colSpan={visibleColumnsCount} className="py-2 px-2 text-muted-foreground">
                                                <div className="flex items-center gap-2 text-primary font-medium hover:text-primary/80">
                                                    <Plus className="h-4 w-4" />
                                                    <span>Add Task</span>
                                                </div>
                                            </TableCell>
                                        </TableRow>
                                    )
                                )}
                            </tbody>
                        </table>
                    </DndContext>
                </div>
            </div>
        </div>
    );
}
