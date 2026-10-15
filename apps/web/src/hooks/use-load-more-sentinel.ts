"use client";

import { useEffect, useState } from "react";

interface UseLoadMoreSentinelProps {
  /** Callback to trigger when the sentinel becomes visible */
  onLoadMore: () => void;
  /** Prevents triggering while already loading */
  isLoading: boolean;
  /** Only observes if there is more data to load */
  hasMore: boolean;
  /** IntersectionObserver rootMargin (default: "200px") */
  rootMargin?: string;
  /** IntersectionObserver threshold (default: 0.1) */
  threshold?: number;
}

/**
 * useLoadMoreSentinel Hook
 * 
 * A centralized hook for infinite scrolling using IntersectionObserver.
 * Returns a ref that should be attached to the "Load More" sentinel element.
 * 
 * Used across:
 * - List View (TaskTableBody)
 * - Kanban Board (Columns)
 * - Gantt Chart
 */
export function useLoadMoreSentinel<T extends HTMLElement>({
  onLoadMore,
  isLoading,
  hasMore,
  rootMargin = "200px",
  threshold = 0.1,
}: UseLoadMoreSentinelProps) {
  // A callback ref, not useRef: sentinels are rendered conditionally (e.g. when a
  // project group is expanded), and a plain ref changing never re-runs the effect,
  // so a sentinel that mounted later was never observed and paging stalled.
  const [target, sentinelRef] = useState<T | null>(null);

  useEffect(() => {
    if (!target || !hasMore) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !isLoading) {
          onLoadMore();
        }
      },
      { rootMargin, threshold }
    );

    observer.observe(target);
    return () => observer.disconnect();
  }, [target, onLoadMore, isLoading, hasMore, rootMargin, threshold]);

  return sentinelRef;
}
