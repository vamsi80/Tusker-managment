import { useState, useCallback, useEffect, useRef } from "react";
import { loadTasksAction } from "@/actions/task/list-actions";
import { TaskFilters } from "@/components/task/shared/types";
import { useTaskCacheStore } from "@/lib/store/task-cache-store";
import { toast } from "sonner";

interface UseTaskPaginationProps {
    workspaceId: string;
    projectId?: string;
    filters: TaskFilters;
    initialTasks?: any[];
    initialHasMore?: boolean;
    initialNextCursor?: any;
    pageSize?: number;
}

export function useTaskPagination({
    workspaceId,
    projectId,
    filters,
    initialTasks = [],
    initialHasMore = false,
    initialNextCursor = null,
    pageSize = 20,
}: UseTaskPaginationProps) {
    const [tasks, setTasks] = useState<any[]>(initialTasks);
    const [hasMore, setHasMore] = useState(initialHasMore);
    const [nextCursor, setNextCursor] = useState(initialNextCursor);
    const [isLoading, setIsLoading] = useState(false);
    const [isLoadingMore, setIsLoadingMore] = useState(false);

    const requestIdRef = useRef(0);
    const hasHydratedRef = useRef(false);
    const { setProjectTasksCache, getProjectTasksCache } = useTaskCacheStore();

    const tasksRef = useRef(tasks);
    tasksRef.current = tasks;

    const refresh = useCallback(async () => {
        if (pageSize === 0) return;

        setIsLoading(true);
        const rid = ++requestIdRef.current;

        try {
            const { ...safeFilters } = filters;
            const response = await loadTasksAction({
                ...safeFilters,
                workspaceId,
                projectId: projectId && projectId !== "" ? projectId : undefined,
                limit: pageSize,
            });

            if (rid !== requestIdRef.current) return;

            if (response.success && response.data) {
                setTasks(response.data.tasks);
                setHasMore(response.data.hasMore);
                setNextCursor(response.data.nextCursor);
                // Update cache
                const key = projectId ? `proj-${projectId}` : `ws-${workspaceId}`;
                setProjectTasksCache(key, {
                    tasks: response.data.tasks,
                    hasMore: response.data.hasMore,
                    nextCursor: response.data.nextCursor,
                });
            } else {
                toast.error(response.error || "Failed to refresh tasks");
            }
        } catch (error) {
            console.error("Refresh tasks error:", error);
            toast.error("Failed to refresh tasks");
        } finally {
            setIsLoading(false);
        }
    }, [filters, workspaceId, projectId, pageSize]);

    const loadMore = useCallback(async () => {
        if (!hasMore || isLoadingMore) return;

        setIsLoadingMore(true);
        const rid = requestIdRef.current;

        try {
            const { ...safeFilters } = filters;
            const response = await loadTasksAction({
                ...safeFilters,
                workspaceId,
                projectId: projectId && projectId !== "" ? projectId : undefined,
                cursor: nextCursor,
                limit: pageSize,
            });

            if (rid !== requestIdRef.current) return;

            if (response.success && response.data) {
                const newTasks = response.data.tasks;
                setTasks(prev => {
                    const existingIds = new Set(prev.map(t => t.id));
                    const uniqueNewTasks = newTasks.filter((t: any) => !existingIds.has(t.id));
                    return [...prev, ...uniqueNewTasks];
                });
                setHasMore(response.data.hasMore);
                setNextCursor(response.data.nextCursor);
            } else {
                toast.error(response.error || "Failed to load more tasks");
            }
        } catch (error) {
            console.error("Load more tasks error:", error);
            toast.error("Failed to load more tasks");
        } finally {
            setIsLoadingMore(false);
        }
    }, [hasMore, isLoadingMore, nextCursor, filters, workspaceId, projectId, pageSize]);

    // Handle initial state and filter changes
    useEffect(() => {
        if (!hasHydratedRef.current) {
            hasHydratedRef.current = true;
            // If we have initialTasks, we consider ourselves hydrated.
            // If not, try to load from cache or trigger refresh.
            if (initialTasks.length > 0) return;

            const key = projectId ? `proj-${projectId}` : `ws-${workspaceId}`;
            const cached = getProjectTasksCache(key);
            if (cached) {
                setTasks(cached.tasks);
                setHasMore(cached.hasMore);
                setNextCursor(cached.nextCursor);
                return;
            }
        }

        refresh();
    }, [filters, workspaceId, projectId, refresh, getProjectTasksCache, initialTasks.length]);

    return {
        tasks,
        setTasks,
        pagination: {
            hasMore,
            isLoading,
            isLoadingMore,
            loadMore,
            refresh,
        },
    };
}
