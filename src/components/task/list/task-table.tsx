"use client";

import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { SubTaskList } from "./subtask-list";
import { Button } from "@/components/ui/button";
import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { Loader2, Plus, ChevronsUpDown, Maximize2, Minimize2 } from "lucide-react";
import { loadMoreTasksAction, loadMoreTasksFlatAction, loadSubTasksAction, loadSubTasksBatchAction, loadSortedSubTasksAction } from "@/actions/task/list-actions";
import { updateSubtaskPositions } from "@/actions/task/gantt";
import { useSubTaskSheet } from "@/contexts/subtask-sheet-context";
import { TableCell, TableRow } from "@/components/ui/table";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { ProjectMembersType } from "@/data/project/get-project-members";
import { SubTaskType } from "@/data/task/list/get-subtasks";
import { arrayMove, sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, DragEndEvent } from "@dnd-kit/core";
import { TaskWithSubTasks, SortConfig, TableViewMode, SortField } from "@/components/task/shared/types";
import { TaskRow } from "./task-row";
import { TaskFilters } from "../shared/types";
import { GlobalFilterToolbar } from "../shared/global-filter-toolbar";
import { ColumnVisibility } from "../shared/column-visibility";
import { extractAllFilterOptions } from "@/lib/utils/extract-filter-options";
import { InlineTaskForm } from "./inline-task-form";
import { ProjectRow } from "./project-row";
import { SortedTaskRow } from "./sorted-task-row";
import { SortableHeader } from "./sortable-header";
import { UserPermissionsType } from "@/data/user/get-user-permissions";
import { useTaskCacheStore } from "@/lib/store/task-cache-store";

interface TaskTableProps {
    initialTasks: TaskWithSubTasks[];
    initialHasMore: boolean;
    initialTotalCount?: number;
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
    projectCounts?: Record<string, number>;
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
    initialHasMore,
    initialTotalCount,
    projectCounts,
}: TaskTableProps) {

    const [searchQuery, setSearchQuery] = useState("");
    const [filters, setFilters] = useState<TaskFilters>({});
    const [isLoadingFilters, setIsLoadingFilters] = useState(false);
    const [expanded, setExpanded] = useState<Record<string, boolean>>({});
    const [loadingSubTasks, setLoadingSubTasks] = useState<Record<string, boolean>>({});
    const [loadingMoreSubTasks, setLoadingMoreSubTasks] = useState<Record<string, boolean>>({});
    const [updatingTaskId, setUpdatingTaskId] = useState<string | null>(null);
    const [expandedProjects, setExpandedProjects] = useState<Record<string, boolean>>({});
    const [sorts, setSorts] = useState<SortConfig[]>([]);
    const [sortedTasks, setSortedTasks] = useState<Record<string, any[]>>({});
    const [isSortedViewLoading, setIsSortedViewLoading] = useState(false);
    const setCachedSubTasks = useTaskCacheStore(state => state.setCachedSubTasks);
    const getCachedSubTasks = useTaskCacheStore(state => state.getCachedSubTasks);
    const setProjectTasksCache = useTaskCacheStore(state => state.setProjectTasksCache);
    const observerRef = useRef<IntersectionObserver | null>(null);
    const loadProjectTasksRef = useRef<((id: string) => Promise<void>) | null>(null);
    const autoExpandRef = useRef(false);
    const tasksRef = useRef<TaskWithSubTasks[]>([]);
    // Assigned after tasks declaration
    const viewMode: TableViewMode = useMemo(() => {
        return sorts.length > 0 ? "sorted" : "hierarchy";
    }, [sorts]);

    const hydrateTasks = useCallback((taskList: TaskWithSubTasks[]) => {
        const getCache = useTaskCacheStore.getState().getCachedSubTasks;
        return taskList.map(t => {
            if (t.subTasks !== undefined) return t; // Already has data (or empty array)
            const cached = getCache(t.id);
            if (cached) {
                return {
                    ...t,
                    subTasks: cached.subTasks,
                    subTasksHasMore: cached.hasMore,
                    subTasksPage: cached.page
                };
            }
            return t;
        });
    }, []);

    const [tasks, setTasks] = useState<TaskWithSubTasks[]>(() => {
        // Unified Logic: Identify relevant projects and merge their caches with initial server data
        const relevantProjectIds = level === 'project' && projectId
            ? [projectId]
            : projects.map(p => p.id);

        const getCache = useTaskCacheStore.getState().getProjectTasksCache;
        const cachedTasks = relevantProjectIds.flatMap(pId => {
            const cache = getCache(pId);
            // Limit initial render to 100 items to prevent browser freeze when coming from Gantt (5000+ items)
            // AND Filter out subtasks (since Gantt might cache flat list which pollutes the root list)
            return cache ? cache.tasks.filter(t => !t.parentTaskId).slice(0, 100) : [];
        });

        // Merge Strategy: Cache + Initial (Deduplicate by ID)
        // We prioritize Initial (Server) for updates, but keep Cache for extra loaded items
        const taskMap = new Map<string, TaskWithSubTasks>();

        // 1. Seed with Cache
        cachedTasks.forEach(t => taskMap.set(t.id, t));

        // 2. Update/Seed with Initial Tasks (Current Server Truth)
        initialTasks.forEach(t => taskMap.set(t.id, t));

        let mergedList = Array.from(taskMap.values());

        // 3. Filter by scope (just in case cache had extraneous items)
        if (level === 'project' && projectId) {
            mergedList = mergedList.filter(t => t.projectId === projectId);
        }

        // 4. Hydrate subtasks
        return hydrateTasks(mergedList);
    });

    tasksRef.current = tasks;

    // SYNC INITIAL TASKS TO CACHE
    // Takes the server-provided initial tasks and updates the specific project caches
    // ensuring consistency between Workspace and Project views.
    useEffect(() => {
        if (!initialTasks || initialTasks.length === 0) return;

        const state = useTaskCacheStore.getState();
        const tasksByProject: Record<string, TaskWithSubTasks[]> = {};

        // Group
        initialTasks.forEach(t => {
            const pId = t.projectId || 'unknown';
            if (!tasksByProject[pId]) tasksByProject[pId] = [];
            tasksByProject[pId].push(t);
        });

        // Update Stores
        Object.entries(tasksByProject).forEach(([pId, newTasks]) => {
            const currentCache = state.getProjectTasksCache(pId);

            if (currentCache) {
                // Merge with existing
                const mergedMap = new Map();
                currentCache.tasks.forEach(t => mergedMap.set(t.id, t));
                newTasks.forEach(t => mergedMap.set(t.id, t));

                state.setProjectTasksCache(pId, {
                    ...currentCache,
                    tasks: Array.from(mergedMap.values()) as TaskWithSubTasks[]
                });
            } else {
                // Initialize
                state.setProjectTasksCache(pId, {
                    tasks: newTasks,
                    hasMore: initialHasMore, // Best effort approximation
                    page: 1,
                    totalCount: initialTotalCount || newTasks.length
                });
            }
        });
    }, [initialTasks, initialHasMore, initialTotalCount, setProjectTasksCache]);

    const [projectPagination, setProjectPagination] = useState<Record<string, { page: number; hasMore: boolean; isLoading: boolean }>>(() => {
        if (level === 'project' && projectId) {
            const cached = useTaskCacheStore.getState().getProjectTasksCache(projectId);
            if (cached) {
                return {
                    [projectId]: {
                        // If cache has more than we rendered (100), reset pagination to continue from there
                        page: cached.tasks.length > 100 ? 2 : cached.page,
                        hasMore: cached.tasks.length > 100 ? true : cached.hasMore,
                        isLoading: false
                    }
                };
            }
        } else if (level === 'workspace') {
            const initialState: Record<string, { page: number; hasMore: boolean; isLoading: boolean }> = {};
            projects.forEach(p => {
                const cached = useTaskCacheStore.getState().getProjectTasksCache(p.id);
                if (cached) {
                    initialState[p.id] = {
                        page: cached.tasks.length > 100 ? 2 : cached.page,
                        hasMore: cached.tasks.length > 100 ? true : cached.hasMore,
                        isLoading: false
                    };
                }
            });
            if (Object.keys(initialState).length > 0) return initialState;
        }

        if (level === 'project' && projectId && initialTasks.length > 0) {
            return {
                [projectId]: {
                    page: 1,
                    hasMore: initialHasMore,
                    isLoading: false
                }
            };
        }
        return {};
    });

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
        // clearCache(); // Don't clear cache on filter change to prevent reloading subtasks
        setExpanded({});
        setProjectPagination({});
        if (Object.keys(filters).length > 0 || searchQuery) {
            setTasks([]);
        }
        // Clear sorted tasks when filters or search change
        setSortedTasks({});
    }, [filters, searchQuery]);

    // Effect to load sorted tasks when sorting is active
    useEffect(() => {
        if (viewMode === "sorted" && sorts.length > 0) {
            setIsSortedViewLoading(true);

            // Build filters with projectId if in project view
            const sortFilters = {
                ...filters,
                startDate: filters.startDate ? new Date(filters.startDate) : undefined,
                endDate: filters.endDate ? new Date(filters.endDate) : undefined,
                search: searchQuery,
                // Add projectId filter if in project view (level === 'project')
                ...(level === 'project' && projectId ? { projectId } : {})
            };

            loadSortedSubTasksAction(
                workspaceId,
                { ...sortFilters, workspaceId },
                sorts,
                1,
                100 // Load more items for sorted view
            ).then(response => {
                if (response.success && response.data) {
                    setSortedTasks(response.data.tasksByProject);
                } else {
                    toast.error(response.error || "Failed to load sorted tasks");
                }
            }).catch(error => {
                console.error("Error loading sorted tasks:", error);
                toast.error("Failed to load sorted tasks");
            }).finally(() => {
                setIsSortedViewLoading(false);
            });
        } else {
            // Clear sorted tasks when switching back to hierarchy view
            setSortedTasks({});
        }
    }, [viewMode, sorts, workspaceId, filters, searchQuery, projectId, level]);

    const [activeInlineProjectId, setActiveInlineProjectId] = useState<string | null>(null);
    const [filteredProjects, setFilteredProjects] = useState<{ id: string; name: string; }[]>(projects || []);
    const totalCount = tasks.length;

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
                    projectId: targetProjectId,
                    startDate: filters.startDate ? new Date(filters.startDate) : undefined,
                    endDate: filters.endDate ? new Date(filters.endDate) : undefined,
                    search: searchQuery,
                    workspaceId
                },
                nextPage,
                10
            );

            if (response.success && response.data) {
                setTasks(prev => {
                    const existingIds = new Set(prev.map(t => t.id));
                    const newTasks = (response.data!.tasks as unknown as TaskWithSubTasks[])
                        .filter(task => !existingIds.has(task.id));
                    const updatedList = [...prev, ...newTasks];

                    // Cache Logic
                    const tasksForCache = updatedList.filter(t => t.projectId === targetProjectId);
                    setProjectTasksCache(targetProjectId, {
                        tasks: tasksForCache,
                        hasMore: response.data!.hasMore ?? false,
                        page: nextPage,
                        totalCount: response.data!.totalCount
                    });

                    if (autoExpandRef.current && newTasks.length > 0) {
                        setTimeout(() => {
                            setExpanded(prevExpanded => {
                                const newExpanded = { ...prevExpanded };
                                newTasks.forEach(t => { newExpanded[t.id] = true; });
                                return newExpanded;
                            });
                        }, 0);
                    }

                    return hydrateTasks(updatedList);
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

    useEffect(() => {
        loadProjectTasksRef.current = loadProjectTasks;
    }, [loadProjectTasks]);

    const toggleProjectExpand = (targetProjectId: string) => {
        setExpandedProjects(prev => {
            const isExpanding = !prev[targetProjectId];
            return {
                ...prev,
                [targetProjectId]: isExpanding
            };
        });
        const isCurrentlyExpanded = expandedProjects[targetProjectId];
        if (!isCurrentlyExpanded) {
            if (!projectPagination[targetProjectId]) {
                loadProjectTasks(targetProjectId);
            }
        }
    };

    const handleSubTaskClick = (subTask: SubTaskType) => {
        openSubTaskSheet(subTask);
    };

    useEffect(() => {
        if (level === 'project' && projectId && !projectPagination[projectId]) {
            loadProjectTasks(projectId);
        }
    }, [level, projectId]);

    const { openSubTaskSheet } = useSubTaskSheet();

    const filterOptions = React.useMemo(() => {
        const options = extractAllFilterOptions(tasks as any, showAdvancedFilters ? 'workspace' : 'project');

        const assigneesForFilter = assignees || members
            .filter(member => member.workspaceMember?.user) // Filter out members without user data
            .map(member => ({
                id: member.workspaceMember.user!.id,
                name: member.workspaceMember.user!.name,
                surname: member.workspaceMember.user!.surname || undefined,
            }))
            .sort((a, b) => {
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

    // 1. Lazy Subtask Loader Callback (Passed to TaskRow)
    const handleRequestSubtasks = useCallback(async (taskId: string) => {
        if (processedSubTasksRef.current.has(taskId) || fetchingSubTasksRef.current.has(taskId)) return;

        // Note: references active 'tasks' state via closure or ref would be better, 
        // but for now we look up in current render scope tasks.
        const task = tasksRef.current.find(t => t.id === taskId);
        if (!task) return;

        // Double check checks
        if (task.subTasks !== undefined) {
            processedSubTasksRef.current.add(taskId);
            return;
        }

        // Cache Hit
        const cached = getCachedSubTasks(taskId);
        if (cached) {
            setTasks(prev => prev.map(t => {
                if (t.id === taskId) {
                    return {
                        ...t,
                        subTasks: cached.subTasks,
                        subTasksHasMore: cached.hasMore,
                        subTasksPage: cached.page
                    };
                }
                return t;
            }));
            processedSubTasksRef.current.add(taskId);
            return;
        }

        // Fetch
        fetchingSubTasksRef.current.add(taskId);
        setLoadingSubTasks(prev => ({ ...prev, [taskId]: true }));

        const taskProjectId = task.projectId || projectId || "";

        try {
            const response = await loadSubTasksAction(taskId, workspaceId, taskProjectId, { workspaceId }, 1, 10);

            if (response.success && response.data) {
                const result = response.data;
                processedSubTasksRef.current.add(taskId);

                // Dedup
                const uniqueSubTasks = result.subTasks.filter((st, index, self) =>
                    index === self.findIndex((t) => (t.id === st.id))
                );

                setCachedSubTasks(taskId, {
                    subTasks: uniqueSubTasks,
                    hasMore: result.hasMore,
                    page: 1
                });

                setTasks(prev => prev.map(t => {
                    if (t.id === taskId) {
                        return {
                            ...t,
                            subTasks: uniqueSubTasks,
                            subTasksHasMore: result.hasMore,
                            subTasksPage: 1
                        };
                    }
                    return t;
                }));
            }
        } catch (err) {
            console.error(`Failed to load subtasks for ${taskId}`, err);
        } finally {
            fetchingSubTasksRef.current.delete(taskId);
            setLoadingSubTasks(prev => {
                const next = { ...prev };
                delete next[taskId];
                return next;
            });
        }
    }, [projectId, workspaceId, getCachedSubTasks, setCachedSubTasks]);


    // 3. UI-ONLY Toggle
    const toggleExpand = (taskId: string) => {
        setExpanded(prev => ({ ...prev, [taskId]: !prev[taskId] }));
    };

    // 4. UI-ONLY Expand All
    // 4. UI-ONLY Expand All + Cached Load
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

        // 1. Bulk Apply Cache for Immediate Display
        // We use hydrateTasks to ensure state is consistent with cache before expanding
        setTasks(prev => hydrateTasks(prev));

        // 2. Expand all tasks (This will trigger lazy loaders for non-cached items)
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
                setCachedSubTasks(taskId, {
                    subTasks: combinedSubTasks,
                    hasMore: response.data!.hasMore,
                    page: nextPage,
                });

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

    // Handle sort column click
    const handleSort = (field: SortField) => {
        setSorts(prevSorts => {
            const existingSort = prevSorts.find(s => s.field === field);

            if (existingSort) {
                // Toggle direction or remove if already descending
                if (existingSort.direction === "asc") {
                    return prevSorts.map(s =>
                        s.field === field ? { ...s, direction: "desc" as const } : s
                    );
                } else {
                    // Remove this sort
                    return prevSorts.filter(s => s.field !== field);
                }
            } else {
                // Add new sort
                return [...prevSorts, { field, direction: "asc" as const }];
            }
        });
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
                        setSorts([]); // Also clear sorts when clearing all filters
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
                                    <SortableHeader
                                        field="name"
                                        label="Task Name"
                                        sorts={sorts}
                                        onSortChange={handleSort}
                                        className="w-[250px]"
                                    />
                                    {/* Project column removed (using grouping instead) */}
                                    {columnVisibility.description && <th className="text-foreground h-10 px-2 text-left align-middle font-medium whitespace-nowrap w-[200px] bg-background">Description</th>}
                                    {columnVisibility.assignee && (
                                        <SortableHeader
                                            field="assignee"
                                            label="Assignee"
                                            sorts={sorts}
                                            onSortChange={handleSort}
                                            className="w-[100px]"
                                        />
                                    )}
                                    {columnVisibility.reviewer && (
                                        <th className="text-foreground h-10 px-2 text-left align-middle font-medium whitespace-nowrap w-[100px] bg-background">
                                            Reviewer
                                        </th>
                                    )}
                                    {columnVisibility.status && (
                                        <SortableHeader
                                            field="status"
                                            label="Status"
                                            sorts={sorts}
                                            onSortChange={handleSort}
                                            className="w-[100px]"
                                        />
                                    )}
                                    {columnVisibility.startDate && (
                                        <SortableHeader
                                            field="startDate"
                                            label="Start Date"
                                            sorts={sorts}
                                            onSortChange={handleSort}
                                            className="w-[100px]"
                                        />
                                    )}
                                    {columnVisibility.dueDate && (
                                        <th className="text-foreground h-10 px-2 text-left align-middle font-medium whitespace-nowrap w-[100px] bg-background">
                                            Due Date
                                        </th>
                                    )}
                                    {columnVisibility.progress && (
                                        <SortableHeader
                                            field="dueDate"
                                            label="Deadline"
                                            sorts={sorts}
                                            onSortChange={handleSort}
                                            className="w-[100px]"
                                        />
                                    )}
                                    {columnVisibility.tag && (
                                        <th className="text-foreground h-10 px-2 text-left align-middle font-medium whitespace-nowrap w-[120px] bg-background">
                                            Tag
                                        </th>
                                    )}
                                    <th className="text-foreground h-10 px-2 text-left align-middle font-medium whitespace-nowrap w-[50px] bg-background"></th>
                                </tr>
                            </thead>
                            <tbody>
                                {/* SORTED VIEW: Flat task rows grouped by project */}
                                {viewMode === "sorted" ? (
                                    isSortedViewLoading ? (
                                        <TableRow>
                                            <TableCell colSpan={visibleColumnsCount} className="h-12">
                                                <div className="flex items-center gap-2 px-2">
                                                    <Skeleton className="h-4 w-full" />
                                                </div>
                                            </TableCell>
                                        </TableRow>
                                    ) : Object.keys(sortedTasks).length > 0 ? (
                                        level === 'workspace' ? (
                                            Object.entries(sortedTasks).map(([projectId, projectSortedTasks]) => {
                                                const project = projects?.find(p => p.id === projectId);
                                                if (projectId === 'unknown' && projectSortedTasks.length === 0) return null;

                                                const isProjectExpanded = expandedProjects[projectId] === true;

                                                return (
                                                    <React.Fragment key={`sorted-${projectId}`}>
                                                        <ProjectRow
                                                            project={project || { id: projectId, name: "Unknown Project" }}
                                                            totalTasksCount={projectSortedTasks.length}
                                                            isExpanded={isProjectExpanded}
                                                            onToggle={() => toggleProjectExpand(projectId)}
                                                            colSpan={visibleColumnsCount}
                                                        >
                                                            {isProjectExpanded && projectSortedTasks.map((task: any) => (
                                                                <SortedTaskRow
                                                                    key={task.id}
                                                                    task={task}
                                                                    columnVisibility={columnVisibility}
                                                                    onClick={() => handleSubTaskClick(task)}
                                                                />
                                                            ))}
                                                        </ProjectRow>
                                                    </React.Fragment>
                                                );
                                            })
                                        ) : (
                                            Object.values(sortedTasks).flat().map((task: any) => (
                                                <SortedTaskRow
                                                    key={task.id}
                                                    task={task}
                                                    columnVisibility={columnVisibility}
                                                    onClick={() => handleSubTaskClick(task)}
                                                />
                                            ))
                                        )
                                    ) : (
                                        <TableRow>
                                            <TableCell colSpan={visibleColumnsCount} className="h-24 text-center text-muted-foreground">
                                                No tasks found.
                                            </TableCell>
                                        </TableRow>
                                    )
                                ) : (
                                    groupedTasks ? (
                                        Object.entries(groupedTasks).map(([projectId, projectTasks]) => {
                                            const project = projects?.find(p => p.id === projectId);
                                            if (projectId === 'unknown' && projectTasks.length === 0) return null;

                                            const isProjectExpanded = expandedProjects[projectId] === true;

                                            return (
                                                <React.Fragment key={projectId}>
                                                    <ProjectRow
                                                        project={project || { id: projectId, name: "Unknown Project" }}
                                                        totalTasksCount={projectCounts ? (projectCounts[projectId] || 0) : projectTaskCounts[projectId]}
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
                                                                    onRequestSubtasks={handleRequestSubtasks}
                                                                    isCached={!!getCachedSubTasks(task.id)}
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
                                                                        <div className="h-1 w-full" />
                                                                    )}
                                                                </TableCell>
                                                            </TableRow>
                                                        )}
                                                        {isProjectExpanded && !projectPagination[projectId]?.isLoading && projectTasks.length === 0 && (!!searchQuery || hasActiveFilters(filters) || !canCreateSubTask) && (
                                                            <TableRow>
                                                                <TableCell colSpan={visibleColumnsCount} className="h-24 text-center text-muted-foreground">
                                                                    No tasks found.
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
                                                    onRequestSubtasks={handleRequestSubtasks}
                                                    isCached={!!getCachedSubTasks(task.id)}
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
                                    )
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

                                {filteredTasks.length === 0 && !isLoadingFilters && !groupedTasks && (
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
