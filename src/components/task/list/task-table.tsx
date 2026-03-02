"use client";

import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { Loader2, Plus, ChevronsUpDown, Maximize2, Minimize2, ChevronDown } from "lucide-react";
import { loadTasksAction } from "@/actions/task/list-actions";
import { useSubTaskSheetActions } from "@/contexts/subtask-sheet-context";
import { ProjectMembersType } from "@/data/project/get-project-members";
import { SubTaskType } from "@/data/task";
import { DndContext, closestCenter } from "@dnd-kit/core";
import { TaskWithSubTasks, SortConfig, SortField, hasActiveFilters } from "@/components/task/shared/types";
import { TaskFilters } from "../shared/types";
import { GlobalFilterToolbar } from "../shared/global-filter-toolbar";
import { ColumnVisibility } from "../shared/column-visibility";
import { extractAllFilterOptions } from "@/lib/utils/extract-filter-options";
import { SortableHeader } from "./sort/sortable-header";
import { UserPermissionsType } from "@/data/user/get-user-permissions";
import { useTaskCacheStore } from "@/lib/store/task-cache-store";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

// Extracted UI Components
import { TableLoading } from "./table/table-loading";
import { LoadMoreSentinel } from "./table/load-more-sentinel";
import { ProjectTaskGroup } from "./group/project-task-group";
import { FlatTaskList } from "./group/flat-task-list";
import { EmptyState } from "./table/empty-state";
import { SortedTaskList } from "./sort/sorted-task-list";

interface TaskTableProps {
    initialTasks: TaskWithSubTasks[];
    initialHasMore: boolean;
    initialNextCursor?: any;
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
    initialNextCursor,
    initialTotalCount,
    projectCounts,
}: TaskTableProps) {

    const [searchQuery, setSearchQuery] = useState("");
    const [filters, setFilters] = useState<TaskFilters>({});
    const [isLoadingFilters, setIsLoadingFilters] = useState(false);
    const [isCurrentlyFiltered, setIsCurrentlyFiltered] = useState(false);
    const filtersActive = hasActiveFilters(filters) || !!searchQuery;
    const [expanded, setExpanded] = useState<Record<string, boolean>>({});
    const [loadingSubTasks, setLoadingSubTasks] = useState<Record<string, boolean>>({});
    const [loadingMoreSubTasks, setLoadingMoreSubTasks] = useState<Record<string, boolean>>({});
    const [updatingTaskId, setUpdatingTaskId] = useState<string | null>(null);
    const [expandedProjects, setExpandedProjects] = useState<Record<string, boolean>>({});
    const [sorts, setSorts] = useState<SortConfig[]>([]);
    const [sortedTasks, setSortedTasks] = useState<any[]>([]);
    const [sortedHasMore, setSortedHasMore] = useState(false);
    const [isLoadingMoreSorted, setIsLoadingMoreSorted] = useState(false);
    const [isSortedViewLoading, setIsSortedViewLoading] = useState(false);
    const setCachedSubTasks = useTaskCacheStore(state => state.setCachedSubTasks);
    const getCachedSubTasks = useTaskCacheStore(state => state.getCachedSubTasks);
    const setProjectTasksCache = useTaskCacheStore(state => state.setProjectTasksCache);
    const observerRef = useRef<IntersectionObserver | null>(null);
    const loadProjectTasksRef = useRef<((id: string) => Promise<void>) | null>(null);
    const loadMoreSortedRef = useRef<(() => Promise<void>) | null>(null);
    const sortedSentinelRef = useRef<HTMLTableRowElement | null>(null);
    const autoExpandRef = useRef(false);
    const tasksRef = useRef<TaskWithSubTasks[]>([]);
    // Assigned after tasks declaration
    const mode = useMemo(() => {
        return sorts.length > 0 ? "sorted" : "hierarchy";
    }, [sorts]);

    // Stable string key derived from sorts — used as a useEffect dependency instead of
    // JSON.stringify(sorts) which creates a new string on every render even when sorts
    // hasn't actually changed.
    const sortsKey = sorts.map(s => `${s.field}:${s.direction}`).join(",");

    const hydrateTasks = useCallback((taskList: TaskWithSubTasks[]) => {
        // Skip persistent cache hydration when filters are active to prevent 
        // "Unfiltered" subtasks from leaking into a filtered view.
        if (filtersActive) return taskList;

        const getCache = useTaskCacheStore.getState().getCachedSubTasks;
        return taskList.map(t => {
            if (t.subTasks !== undefined) return t; // Already has data (or empty array)
            const cached = getCache(t.id);
            if (cached) {
                return {
                    ...t,
                    subTasks: cached.subTasks,
                    subTasksHasMore: cached.hasMore,
                    subTasksNextCursor: cached.nextCursor
                };
            }
            return t;
        });
    }, [filtersActive]);

    const [tasks, setTasks] = useState<TaskWithSubTasks[]>(() => {
        // Skip cache merge if we have active filters/search
        if (filtersActive) {
            return initialTasks;
        }

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

    const [projectPagination, setProjectPagination] = useState<Record<string, { page: number; nextCursor: any; hasMore: boolean; isLoading: boolean }>>(() => {
        if (level === 'project' && projectId) {
            const cached = useTaskCacheStore.getState().getProjectTasksCache(projectId);
            if (cached) {
                return {
                    [projectId]: {
                        page: cached.page,
                        nextCursor: cached.nextCursor,
                        hasMore: cached.hasMore,
                        isLoading: false
                    }
                };
            }
        } else if (level === 'workspace') {
            const initialState: Record<string, { page: number; nextCursor: any; hasMore: boolean; isLoading: boolean }> = {};
            projects.forEach(p => {
                const cached = useTaskCacheStore.getState().getProjectTasksCache(p.id);
                if (cached) {
                    initialState[p.id] = {
                        page: cached.page,
                        nextCursor: cached.nextCursor,
                        hasMore: cached.hasMore,
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
                    nextCursor: initialNextCursor,
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

                        if (projectId === "sorted") {
                            loadMoreSortedRef.current?.();
                        } else if (projectId) {
                            loadProjectTasksRef.current?.(projectId);
                        }
                    }
                });
            }, { rootMargin: "200px" });
        }
        return observerRef.current;
    };

    useEffect(() => {
        if (mode !== "hierarchy") return;

        setExpanded({});
        setProjectPagination({});
        processedSubTasksRef.current.clear();
        fetchingSubTasksRef.current.clear();

        setTasks(hydrateTasks(initialTasks));

        if (level === "project" && projectId) {
            setProjectPagination({
                [projectId]: {
                    page: 1,
                    nextCursor: initialNextCursor,
                    hasMore: initialHasMore,
                    isLoading: false,
                },
            });
        }
    }, [mode, initialTasks]);

    useEffect(() => {
        let isAborted = false;

        const fetchFiltered = async () => {
            setIsLoadingFilters(true);
            setIsCurrentlyFiltered(true);

            try {
                const startTime = performance.now();
                console.time("Filter Hierarchy Load");

                const response = await loadTasksAction({
                    workspaceId: workspaceId,
                    ...(level === "project" && projectId ? { projectId } : {}),
                    status: filters.status as any,
                    assigneeId: filters.assigneeId as any,
                    tagId: filters.tagId as any,
                    search: searchQuery,
                    dueAfter: filters.startDate ? new Date(filters.startDate) : undefined,
                    dueBefore: filters.endDate ? new Date(filters.endDate) : undefined,
                    hierarchyMode: "parents",
                    includeSubTasks: true, // Bulk load subtasks in one request
                    limit: 50, // Increase limit for filtered views
                    sorts,
                });

                console.timeEnd("Filter Hierarchy Load");
                const endTime = performance.now();
                console.log(`⏱️ Filter Load took: ${(endTime - startTime).toFixed(2)} ms`);

                if (isAborted) return;

                if (response.success && response.data) {
                    const result = response.data;
                    setTasks(hydrateTasks(result.tasks));

                    if (level === "project" && projectId) {
                        setProjectPagination({
                            [projectId]: {
                                page: 1,
                                nextCursor: result.nextCursor,
                                hasMore: result.hasMore,
                                isLoading: false,
                            },
                        });
                    }

                    // Auto-expand all filtered parents
                    const expandedMap: Record<string, boolean> = {};
                    result.tasks.forEach(t => {
                        expandedMap[t.id] = true;
                    });
                    setExpanded(expandedMap);

                    // Auto-expand project groups if workspace view
                    if (level === "workspace") {
                        const projectExpandMap: Record<string, boolean> = {};
                        result.tasks.forEach(t => {
                            if (t.projectId) projectExpandMap[t.projectId] = true;
                        });
                        setExpandedProjects(projectExpandMap);
                    }
                }
            } catch (err) {
                console.error("Filter error:", err);
                if (!isAborted) toast.error("Failed to apply filters");
            } finally {
                if (!isAborted) setIsLoadingFilters(false);
            }
        };

        if (mode === "hierarchy") {
            if (filtersActive) {
                fetchFiltered();
            } else if (isCurrentlyFiltered) {
                // RESET LOGIC — Restore from cache if possible
                const relevantProjectIds = level === 'project' && projectId ? [projectId] : projects.map(p => p.id);
                const getCache = useTaskCacheStore.getState().getProjectTasksCache;
                const taskMap = new Map<string, TaskWithSubTasks>();
                const newPagination: Record<string, any> = {};

                relevantProjectIds.forEach(pId => {
                    const cache = getCache(pId);
                    if (cache && cache.tasks.length > 0) {
                        // Filter out subtasks from root list
                        cache.tasks.filter(t => !t.parentTaskId).forEach(t => taskMap.set(t.id, t));
                        newPagination[pId] = {
                            page: cache.page,
                            nextCursor: cache.nextCursor,
                            hasMore: cache.hasMore,
                            isLoading: false
                        };
                    } else if (pId === projectId) {
                        // Fallback to initialData
                        initialTasks.forEach(t => taskMap.set(t.id, t));
                        newPagination[pId] = {
                            page: 1,
                            nextCursor: initialNextCursor,
                            hasMore: initialHasMore,
                            isLoading: false
                        };
                    }
                });

                if (!isAborted) {
                    const resetList = Array.from(taskMap.values());
                    setTasks(hydrateTasks(resetList));
                    setProjectPagination(newPagination);
                    setExpanded({});
                    setIsCurrentlyFiltered(false);
                    setIsLoadingFilters(false);
                }
            }
        }

        return () => { isAborted = true; };
    }, [mode, JSON.stringify(filters), searchQuery, sortsKey, workspaceId, projectId, level, initialTasks]);

    // Effect to load sorted/filtered tasks when flat mode is active
    useEffect(() => {
        if (mode !== "sorted") {
            setSortedTasks([]);
            setSortedHasMore(false);
            return;
        }

        let isMounted = true;

        const fetchSorted = async () => {
            setIsSortedViewLoading(true);

            const startTime = performance.now();
            console.time("Filter Flat List Load");

            const res = await loadTasksAction({
                workspaceId,
                ...(level === "project" && projectId ? { projectId } : {}),
                status: filters.status,
                assigneeId: filters.assigneeId,
                tagId: filters.tagId,
                search: searchQuery,
                dueAfter: filters.startDate ? new Date(filters.startDate) : undefined,
                dueBefore: filters.endDate ? new Date(filters.endDate) : undefined,
                onlySubtasks: true,
                sorts,
                limit: 50, // Increased limit for faster "Load More" feel
            });

            console.timeEnd("Filter Flat List Load");
            const endTime = performance.now();
            console.log(`⏱️ Sorted Load took: ${(endTime - startTime).toFixed(2)} ms`);

            if (!isMounted) return;

            if (res.success && res.data) {
                setSortedTasks(res.data.tasks || []);
                setSortedHasMore(res.data.hasMore);

                // Debug: print tasks in sorted order with correct field values
                const sortField = sorts[0]?.field;
                const getSortValue = (t: any, field: string): string => {
                    if (field === "startDate" || field === "dueDate") return t[field] ? new Date(t[field]).toISOString().slice(0, 10) : "null";
                    return String(t[field] ?? "null");
                };
                console.group(`[Sorted] ${res.data.tasks.length} tasks — sort: ${sortField} ${sorts[0]?.direction} | hasMore=${res.data.hasMore}`);
                res.data.tasks.forEach((t: any, i: number) => {
                    console.log(`#${String(i + 1).padStart(2)}  ${sortField}=${getSortValue(t, sortField)}  name=${t.name}  id=${t.id.slice(0, 8)}`);
                });
                console.groupEnd();
            }

            setIsSortedViewLoading(false);
        };

        // Reset pagination before fresh fetch — do NOT clear tasks here to avoid flicker
        setSortedHasMore(false);

        fetchSorted();

        return () => { isMounted = false; };

    }, [sortsKey, workspaceId, projectId, JSON.stringify(filters), searchQuery]);

    const loadMoreSorted = async () => {
        if (!sortedHasMore || isLoadingMoreSorted) {
            // console.log("[LoadMoreSorted] Skip:", { sortedHasMore, isLoadingMoreSorted });
            return;
        }

        // console.log("[LoadMoreSorted] Start — cursor:", sortedCursor);
        setIsLoadingMoreSorted(true);

        try {
            const res = await loadTasksAction({
                workspaceId,
                ...(level === "project" && projectId ? { projectId } : {}),
                status: filters.status,
                assigneeId: filters.assigneeId,
                tagId: filters.tagId,
                search: searchQuery,
                dueAfter: filters.startDate ? new Date(filters.startDate) : undefined,
                dueBefore: filters.endDate ? new Date(filters.endDate) : undefined,
                onlySubtasks: true,
                sorts,
                skip: sortedTasks.length,
                limit: 50,
            });

            if (res.success && res.data) {
                const newTasks = res.data.tasks || [];
                // console.log(`[LoadMoreSorted] Success: ${newTasks.length} tasks, hasMore: ${res.data.hasMore}`);

                setSortedTasks(prev => [...prev, ...newTasks]);
                setSortedHasMore(res.data.hasMore);
            } else {
                console.error("[LoadMoreSorted] Server error:", res.error);
                toast.error("Failed to load more sorted tasks");
                setSortedHasMore(false);
            }
        } catch (err) {
            console.error("[LoadMoreSorted] Runtime error:", err);
            toast.error("An error occurred while loading more tasks");
        } finally {
            setIsLoadingMoreSorted(false);
        }
    };

    useEffect(() => {
        loadMoreSortedRef.current = loadMoreSorted;
    }, [loadMoreSorted]);

    // Dedicated IntersectionObserver for sorted scroll pagination.
    // Re-creates on every tasks-length change AND whenever hasMore flips,
    // so the observer fires even when the sentinel stays in the viewport.
    useEffect(() => {
        const sentinel = sortedSentinelRef.current;
        if (!sentinel) return;

        const obs = new IntersectionObserver(
            (entries) => {
                if (entries[0].isIntersecting && sortedHasMore) {
                    loadMoreSortedRef.current?.();
                }
            },
            { rootMargin: "300px", threshold: 0 }
        );

        obs.observe(sentinel);
        return () => obs.disconnect();
    }, [sortedTasks.length, sortedHasMore]);

    const [activeInlineProjectId, setActiveInlineProjectId] = useState<string | null>(null);
    const [filteredProjects, setFilteredProjects] = useState<{ id: string; name: string; }[]>(projects || []);
    // const totalCount = tasks.length;

    const loadProjectTasks = async (targetProjectId: string) => {
        const currentPagination = projectPagination[targetProjectId] || { page: 0, nextCursor: undefined, hasMore: true, isLoading: false };

        if (currentPagination.isLoading || !currentPagination.hasMore) return;

        setProjectPagination(prev => ({
            ...prev,
            [targetProjectId]: { ...currentPagination, isLoading: true }
        }));

        try {
            const response = await loadTasksAction({
                workspaceId,
                projectId: targetProjectId,
                status: filters.status as any,
                assigneeId: filters.assigneeId as any,
                tagId: filters.tagId as any,
                search: searchQuery,
                dueAfter: filters.startDate ? new Date(filters.startDate) as any : undefined,
                dueBefore: filters.endDate ? new Date(filters.endDate) as any : undefined,
                hierarchyMode: "parents",
                includeSubTasks: true, // Bulk load subtasks in one request
                cursor: currentPagination.nextCursor,
                limit: 50,
                sorts,
            });

            if (response.success && response.data) {
                const resultData = response.data as any;
                setTasks(prev => {
                    const existingIds = new Set(prev.map(t => t.id));
                    const newTasks = (resultData.tasks as unknown as TaskWithSubTasks[])
                        .filter(task => !existingIds.has(task.id));
                    const updatedList = [...prev, ...newTasks];

                    // Cache Logic
                    const tasksForCache = updatedList.filter(t => t.projectId === targetProjectId);
                    setProjectTasksCache(targetProjectId, {
                        tasks: tasksForCache,
                        hasMore: resultData.hasMore ?? false,
                        page: currentPagination.page + 1,
                        nextCursor: resultData.nextCursor,
                        totalCount: resultData.totalCount ?? undefined
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
                        page: currentPagination.page + 1,
                        nextCursor: resultData.nextCursor,
                        hasMore: resultData.hasMore ?? false,
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
            if (!projectPagination[targetProjectId] && !filtersActive) {
                loadProjectTasks(targetProjectId);
            }
        }
    };

    const handleSubTaskClick = (subTask: SubTaskType) => {
        openSubTaskSheet(subTask);
    };

    useEffect(() => {
        if (
            level === 'project' &&
            projectId &&
            !projectPagination[projectId] &&
            !filtersActive
        ) {
            loadProjectTasks(projectId);
        }
    }, [level, projectId, filters, searchQuery]);

    const { openSubTaskSheet } = useSubTaskSheetActions();

    const filterOptions = React.useMemo(() => {
        const options = extractAllFilterOptions(tasks as any, showAdvancedFilters ? 'workspace' : 'project');

        const assigneesForFilter = assignees || members
            .filter(member => member.workspaceMember?.user)
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
                        subTasksNextCursor: cached.nextCursor
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
            // Include current filters so expanded subtasks match the filtered dataset
            const activeFilters = {
                ...filters,
                search: searchQuery || filters.search,
                workspaceId
            };

            const response = await loadTasksAction({
                workspaceId,
                projectId: taskProjectId,
                filterParentTaskId: taskId,
                status: activeFilters.status,
                assigneeId: activeFilters.assigneeId,
                tagId: activeFilters.tagId,
                search: activeFilters.search,
                dueAfter: filters.startDate ? new Date(filters.startDate) : undefined,
                dueBefore: filters.endDate ? new Date(filters.endDate) : undefined,
                limit: 30, // Increased from 10 to 30 for better "Else" loading
                sorts,
            });

            if (response.success && response.data) {
                const result = response.data;
                console.log(`[CLIENT] Loaded subtasks for parent ${taskId}:`, result.tasks);
                processedSubTasksRef.current.add(taskId);

                // Dedup
                const uniqueSubTasks = result.tasks.filter((st: any, index: number, self: any[]) =>
                    index === self.findIndex((t: any) => (t.id === st.id))
                );

                if (!filtersActive) {
                    setCachedSubTasks(taskId, {
                        subTasks: uniqueSubTasks,
                        hasMore: result.hasMore,
                        nextCursor: result.nextCursor
                    });
                }

                setTasks(prev => prev.map(t => {
                    if (t.id === taskId) {
                        return {
                            ...t,
                            subTasks: uniqueSubTasks,
                            subTasksHasMore: result.hasMore,
                            subTasksNextCursor: result.nextCursor
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

            const response = await loadTasksAction({
                workspaceId,
                projectId: task.projectId || projectId,
                filterParentTaskId: taskId,
                status: cleanFilters.status,
                assigneeId: cleanFilters.assigneeId,
                tagId: cleanFilters.tagId,
                search: cleanFilters.search,
                dueAfter: cleanFilters.startDate,
                dueBefore: cleanFilters.endDate,
                cursor: task.subTasksNextCursor,
                limit: 10,
                sorts,
            });

            if (response.success && response.data) {
                const resultData = response.data as any;
                console.log(`[CLIENT] Loaded more subtasks for parent ${taskId}:`, resultData.tasks);
                // Deduplicate: combine existing + new subtasks, remove duplicates
                const existingSubTasks = task.subTasks || [];
                const existingIds = new Set(existingSubTasks.map(st => st.id));
                const newSubTasks = (resultData.tasks as any[]).filter((st: any) =>
                    st.id && !existingIds.has(st.id)
                );
                const combinedSubTasks = [...existingSubTasks, ...newSubTasks];

                if (!filtersActive) {
                    setCachedSubTasks(taskId, {
                        subTasks: combinedSubTasks,
                        hasMore: resultData.hasMore,
                        nextCursor: resultData.nextCursor,
                    });
                }

                setTasks((prevTasks) =>
                    prevTasks.map((t) =>
                        t.id === taskId
                            ? {
                                ...t,
                                subTasks: combinedSubTasks,
                                subTasksHasMore: resultData.hasMore,
                                subTasksNextCursor: resultData.nextCursor,
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
    const handleSort = (field: SortField) => {
        setSorts(prev => {
            const existing = prev.find(s => s.field === field);

            // If no sort active → start ASC
            if (!existing) {
                return [{ field, direction: "asc" as const }];
            }

            // If ASC → switch to DESC
            if (existing.direction === "asc") {
                return [{ field, direction: "desc" as const }];
            }

            // If DESC → remove sort
            return [];
        });
    };

    return (
        <div className="space-y-4 mt-0">
            <div className="flex items-center gap-2">
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
                    "overflow-auto",
                    level === "workspace" ? "max-h-[70vh]" : "max-h-[65vh]",
                    "mt-0",
                    "[&::-webkit-scrollbar]:w-0.5",
                    "[&::-webkit-scrollbar]:h-1",
                    "[&::-webkit-scrollbar-track]:bg-transparent",
                    "[&::-webkit-scrollbar-thumb]:bg-slate-300",
                    "[&::-webkit-scrollbar-thumb]:rounded-full",
                    "[&::-webkit-scrollbar-thumb]:hover:bg-slate-400"
                )}>
                    <DndContext
                        // sensors={sensors}
                        collisionDetection={closestCenter}
                    // onDragEnd={handleDragEnd}
                    >
                        <table className="w-full caption-bottom text-sm table-fixed">
                            <thead className="[&_tr]:border-b">
                                <tr className="sticky top-0 z-10 bg-background border-b shadow-sm hover:bg-muted/50">
                                    <th className="text-foreground h-10 px-2 text-left align-middle font-medium whitespace-nowrap w-[40px] md:w-[50px] bg-background">
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
                                        className="w-[180px] sm:w-[250px] md:w-[350px]"
                                    />
                                    {/* Project column removed (using grouping instead) */}
                                    {columnVisibility.description && <th className="text-foreground h-10 px-2 text-left align-middle font-medium whitespace-nowrap w-[150px] sm:w-[200px] bg-background">Description</th>}
                                    {columnVisibility.assignee && (
                                        <th className="text-foreground h-10 px-2 text-left align-middle font-medium whitespace-nowrap w-[80px] sm:w-[100px] bg-background">
                                            {/* ⚠️ Not sortable — sorting by FK id is meaningless.
                                                Re-enable once assigneeDisplayName is denormalized onto Task. */}
                                            Assignee
                                        </th>
                                    )}
                                    {columnVisibility.reviewer && (
                                        <th className="text-foreground h-10 px-2 text-left align-middle font-medium whitespace-nowrap w-[80px] sm:w-[100px] bg-background">
                                            Reviewer
                                        </th>
                                    )}
                                    {columnVisibility.status && (
                                        <SortableHeader
                                            field="status"
                                            label="Status"
                                            sorts={sorts}
                                            onSortChange={handleSort}
                                            className="w-[90px] sm:w-[120px]"
                                        />
                                    )}
                                    {columnVisibility.startDate && (
                                        <th className="text-foreground h-10 px-2 text-left align-middle font-medium whitespace-nowrap w-[90px] sm:w-[120px] bg-background">
                                            Start Date
                                        </th>
                                    )}
                                    {columnVisibility.dueDate && (
                                        <SortableHeader
                                            field="dueDate"
                                            label="Due Date"
                                            sorts={sorts}
                                            onSortChange={handleSort}
                                            className="w-[90px] sm:w-[120px]"
                                        />
                                    )}
                                    {columnVisibility.progress && (
                                        <th className="text-foreground h-10 px-2 text-left align-middle font-medium whitespace-nowrap w-[100px] sm:w-[150px] bg-background">
                                            Urgency
                                        </th>
                                    )}
                                    {columnVisibility.tag && (
                                        <th className="text-foreground h-10 px-2 text-left align-middle font-medium whitespace-nowrap w-[100px] sm:w-[120px] bg-background">
                                            Tag
                                        </th>
                                    )}
                                    <th className="text-foreground h-10 px-2 text-left align-middle font-medium whitespace-nowrap w-[40px] bg-background"></th>
                                </tr>
                            </thead>
                            <tbody>
                                {/* SORTED VIEW: Flat task rows grouped by project */}
                                {mode === "sorted" ? (
                                    <SortedTaskList
                                        sortedTasks={sortedTasks}
                                        isLoading={isSortedViewLoading}
                                        hasMore={sortedHasMore}
                                        isLoadingMore={isLoadingMoreSorted}
                                        columnVisibility={columnVisibility}
                                        visibleColumnsCount={visibleColumnsCount}
                                        sortedSentinelRef={sortedSentinelRef}
                                        handleSubTaskClick={handleSubTaskClick}
                                    />
                                ) : (
                                    groupedTasks ? (
                                        Object.entries(groupedTasks).map(([currentProjectId, projectTasks]) => {
                                            const project = projects?.find(p => p.id === currentProjectId);
                                            if (currentProjectId === 'unknown' && projectTasks.length === 0) return null;

                                            return (
                                                <ProjectTaskGroup
                                                    key={currentProjectId}
                                                    projectId={currentProjectId}
                                                    project={project || { id: currentProjectId, name: "Unknown Project" }}
                                                    initialTasks={projectTasks}
                                                    totalTasksCount={projectCounts ? (projectCounts[currentProjectId] || 0) : projectTaskCounts[currentProjectId]}
                                                    isExpanded={expandedProjects[currentProjectId] === true}
                                                    onToggle={() => toggleProjectExpand(currentProjectId)}
                                                    visibleColumnsCount={visibleColumnsCount}
                                                    columnVisibility={columnVisibility}
                                                    expandedTasks={expanded}
                                                    onToggleExpandTask={toggleExpand}
                                                    updatingTaskId={updatingTaskId}
                                                    setUpdatingTaskId={setUpdatingTaskId}
                                                    permissions={permissions}
                                                    userId={userId}
                                                    isWorkspaceAdmin={isWorkspaceAdmin}
                                                    leadProjectIds={leadProjectIds}
                                                    projects={projects}
                                                    onRequestSubtasks={handleRequestSubtasks}
                                                    getCachedSubTasks={getCachedSubTasks}
                                                    tags={tags}
                                                    members={members}
                                                    workspaceId={workspaceId}
                                                    canCreateSubTask={canCreateSubTask}
                                                    loadingSubTasks={loadingSubTasks}
                                                    loadingMoreSubTasks={loadingMoreSubTasks}
                                                    onLoadMoreSubTasks={loadMoreSubTasks}
                                                    handleSubTaskClick={handleSubTaskClick}
                                                    level={level}
                                                    paginationState={projectPagination[currentProjectId]}
                                                    getObserver={getObserver}
                                                    filtersActive={filtersActive}
                                                    activeInlineProjectId={activeInlineProjectId}
                                                    setActiveInlineProjectId={setActiveInlineProjectId}
                                                    onUpdateParentTaskLists={(updatedProjectTasks) => {
                                                        // Merge updated project tasks back into main task list
                                                        setTasks(prev => {
                                                            const others = prev.filter(t => t.projectId !== currentProjectId);
                                                            return [...others, ...updatedProjectTasks];
                                                        });
                                                    }}
                                                />
                                            );
                                        })
                                    ) : (
                                        <FlatTaskList
                                            initialTasks={filteredTasks}
                                            columnVisibility={columnVisibility}
                                            visibleColumnsCount={visibleColumnsCount}
                                            expandedTasks={expanded}
                                            onToggleExpandTask={toggleExpand}
                                            updatingTaskId={updatingTaskId}
                                            setUpdatingTaskId={setUpdatingTaskId}
                                            permissions={permissions}
                                            userId={userId}
                                            isWorkspaceAdmin={isWorkspaceAdmin}
                                            leadProjectIds={leadProjectIds}
                                            projects={projects}
                                            onRequestSubtasks={handleRequestSubtasks}
                                            getCachedSubTasks={getCachedSubTasks}
                                            tags={tags}
                                            members={members}
                                            workspaceId={workspaceId}
                                            projectId={projectId}
                                            canCreateSubTask={canCreateSubTask}
                                            loadingSubTasks={loadingSubTasks}
                                            loadingMoreSubTasks={loadingMoreSubTasks}
                                            onLoadMoreSubTasks={loadMoreSubTasks}
                                            handleSubTaskClick={handleSubTaskClick}
                                            level={level}
                                            filtersActive={filtersActive}
                                            activeInlineProjectId={activeInlineProjectId}
                                            setActiveInlineProjectId={setActiveInlineProjectId}
                                            onUpdateParentTaskLists={(updatedTasks) => {
                                                setTasks(updatedTasks);
                                            }}
                                        />
                                    )
                                )}
                                {/* Load More Sentinel for Flat List */}
                                {!groupedTasks && projectPagination[projectId]?.hasMore && (
                                    <LoadMoreSentinel
                                        visibleColumnsCount={visibleColumnsCount}
                                        projectId={projectId}
                                        observer={getObserver()}
                                    />
                                )}

                                {isLoadingFilters && filteredTasks.length === 0 && (
                                    <TableLoading visibleColumnsCount={visibleColumnsCount} />
                                )}

                                {mode !== "sorted" && filteredTasks.length === 0 && !isLoadingFilters && !groupedTasks && (
                                    <EmptyState visibleColumnsCount={visibleColumnsCount} />
                                )}
                            </tbody>
                        </table>
                    </DndContext>
                </div>
            </div>
        </div>
    );
}
