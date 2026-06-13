"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { useFilterStore } from "@/lib/store/filter-store";
import { getActiveFilters, hasActiveFilters, TaskWithSubTasks } from "@/components/task/shared/types";
import { taskViewUrl } from "@/lib/api-client/task-views";

interface FilteredFetchProps {
  workspaceId: string;
  projectId?: string;
  level: "workspace" | "project";
  viewMode: "list" | "kanban" | "gantt";
  onResults: (tasks: TaskWithSubTasks[], meta: Record<string, unknown>) => void;
  onAppendResults?: (tasks: TaskWithSubTasks[], meta: Record<string, unknown>) => void;
  limit?: number;
  /**
   * When true, the hook will ALWAYS fire on mount and on filter changes,
   * even when no filters are active. Used by Kanban to load initial data.
   */
  alwaysFetch?: boolean;
  /**
   * When true, skip the very first unfiltered fetch (server already provided
   * the initial data). Filter changes and filter clears still fetch.
   */
  skipInitialFetch?: boolean;
}

/**
 * useFilteredFetch Hook
 * 
 * Centralizes debounced fetching and cursor-based pagination for filtered tasks.
 * Shares filter and search state from useFilterStore.
 * 
 * - For List/Gantt: only fires when filtersActive === true.
 * - For Kanban (alwaysFetch: true): fires on mount AND on every filter change.
 */
export function useFilteredFetch({
  workspaceId,
  projectId,
  level,
  viewMode,
  onResults,
  onAppendResults,
  limit = 50,
  alwaysFetch = false,
  skipInitialFetch = false,
}: FilteredFetchProps) {
  const { filters, searchQuery, setIsCurrentlyFiltered } = useFilterStore();
  const filtersActive = hasActiveFilters(filters) || !!searchQuery;
  
  const [isLoading, setIsLoading] = useState(false);
  const [pagination, setPagination] = useState<{
    hasMore: boolean;
    nextCursor: string | null;
  }>({ hasMore: false, nextCursor: null });

  const isAbortedRef = useRef(false);
  // Track whether we have already fired the initial (no-filter) fetch
  const initialFetchDoneRef = useRef(false);

  const fetchFiltered = useCallback(async (cursor?: string | null) => {
    if (!cursor) {
      setIsLoading(true);
      if (filtersActive) setIsCurrentlyFiltered(true);
    }

    try {
      const params = new URLSearchParams({
        limit: String(limit),
        facets: cursor ? "false" : "true",
        fields: "description",
      });

      const activeFilters = getActiveFilters(filters);
      activeFilters.forEach((f) => {
        if (f.key === "startDate" || f.key === "endDate") {
          params.set(f.key, new Date(f.value).toISOString());
        } else {
          params.set(f.key, String(f.value));
        }
      });

      if (searchQuery) params.set("search", searchQuery);
      if (cursor) params.set("cursor", JSON.stringify(cursor));

      const url = taskViewUrl(viewMode, workspaceId, level === "project" ? projectId : undefined);
      const res = await fetch(`${url}?${params.toString()}`);
      const response = await res.json();

      if (!isAbortedRef.current && response.success) {
        const tasks = response.data.tasks || [];
        const meta = response.data;

        if (cursor && onAppendResults) {
          onAppendResults(tasks, meta);
        } else {
          onResults(tasks, meta);
        }

        setPagination({
          hasMore: response.data.hasMore ?? false,
          nextCursor: response.data.nextCursor ?? null,
        });
      }
    } catch (error) {
      console.error("[useFilteredFetch] Error fetching filtered tasks:", error);
    } finally {
      if (!isAbortedRef.current && !cursor) {
        setIsLoading(false);
      }
    }
  }, [workspaceId, projectId, level, viewMode, filters, searchQuery, onResults, onAppendResults, setIsCurrentlyFiltered, limit, filtersActive]);

  // Track the exact filters we last fetched to prevent double-fetching on React Strict Mode remounts
  const lastFetchSignatureRef = useRef<string | null>(null);

  // Debounced fetch on filter/search change
  useEffect(() => {
    isAbortedRef.current = false;

    const shouldFetch = filtersActive || alwaysFetch;

    if (!shouldFetch) {
      // No filters and not always-fetch mode: reset pagination and do nothing
      setPagination({ hasMore: false, nextCursor: null });
      if (!filtersActive) setIsCurrentlyFiltered(false);
      lastFetchSignatureRef.current = null;
      return;
    }

    const currentSignature = JSON.stringify({ filters, searchQuery, alwaysFetch });

    // If we've already initiated a fetch for this exact filter combination, skip it to avoid double loading
    if (lastFetchSignatureRef.current === currentSignature) {
       return;
    }

    // Server already provided the initial unfiltered data — mark it as fetched.
    // Subsequent filter changes (and clears) produce a different signature and still fetch.
    if (skipInitialFetch && !initialFetchDoneRef.current && !filtersActive) {
      initialFetchDoneRef.current = true;
      lastFetchSignatureRef.current = currentSignature;
      return;
    }

    // For alwaysFetch mode (Kanban), skip debounce on very first mount
    // so the board appears instantly. Subsequent changes are debounced.
    const isFirstLoad = alwaysFetch && !initialFetchDoneRef.current;
    const delay = isFirstLoad ? 0 : 500;

    const timer = setTimeout(() => {
      initialFetchDoneRef.current = true;
      lastFetchSignatureRef.current = currentSignature;
      fetchFiltered();
    }, delay);

    return () => {
      isAbortedRef.current = true;
      clearTimeout(timer);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters, searchQuery, filtersActive, alwaysFetch, skipInitialFetch, fetchFiltered]);


  const loadMore = useCallback(() => {
    if (!pagination.hasMore || isLoading) return;
    fetchFiltered(pagination.nextCursor);
  }, [pagination, isLoading, fetchFiltered]);

  return {
    isLoading,
    pagination,
    loadMore,
    filtersActive,
  };
}
