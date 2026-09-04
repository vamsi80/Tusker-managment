"use client";

import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { apiClient } from "@/lib/api-client";
import { useSubTaskSheet } from "@/contexts/subtask-sheet-context";

const BLINK_MS = 3000; // .task-blink runs 0.6s five times
const POLL_MS = 200;
const POLL_ATTEMPTS = 25; // give the row ~5s to arrive (subtasks load on demand)

/**
 * Reveals the task a deep link points at: expands its parent row so a subtask
 * is not hidden inside a collapsed group, scrolls it into view, and blinks it.
 *
 * `?focus=<slug>` (the calendar) reveals the row and nothing else. `?subtask=`
 * also opens the detail panel, so there the blink waits for that panel to close
 * — blinking underneath it would go unseen.
 *
 * The row is found in the DOM by `data-task-id` rather than through render
 * state, so nothing has to be threaded down through the table components.
 */
export function useDeepLinkHighlight({
  tasks,
  setExpanded,
  requestSubtasks,
  workspaceId,
}: {
  tasks: any[];
  setExpanded: (updater: any) => void;
  requestSubtasks: (taskId: string) => void;
  workspaceId: string;
}) {
  const searchParams = useSearchParams();
  const slug = searchParams.get("focus") ?? searchParams.get("subtask");
  const { isOpen: isSheetOpen } = useSubTaskSheet();

  const handledSlugRef = useRef<string | null>(null);
  const [pendingTaskId, setPendingTaskId] = useState<string | null>(null);

  // Held in refs so the effect depends on the slug alone. Re-running it because
  // a caller re-created `setExpanded` would drop the pending highlight.
  const tasksRef = useRef(tasks);
  const setExpandedRef = useRef(setExpanded);
  const requestSubtasksRef = useRef(requestSubtasks);
  tasksRef.current = tasks;
  setExpandedRef.current = setExpanded;
  requestSubtasksRef.current = requestSubtasks;

  // 1. Work out which task the link points at and open the group holding it.
  useEffect(() => {
    if (!slug || !workspaceId || handledSlugRef.current === slug) return;
    handledSlugRef.current = slug;

    let cancelled = false;

    const reveal = (task: { id: string; parentTaskId?: string | null }) => {
      if (cancelled) return;
      if (task.parentTaskId) {
        setExpandedRef.current((prev: Record<string, boolean>) => ({
          ...prev,
          [task.parentTaskId!]: true,
        }));
        requestSubtasksRef.current(task.parentTaskId);
      }
      setPendingTaskId(task.id);
    };

    const loaded = tasksRef.current?.find((t) => t.taskSlug === slug);
    if (loaded) {
      // Deferred so this never sets state during the effect that scheduled it.
      const timer = window.setTimeout(() => reveal(loaded), 0);
      return () => {
        cancelled = true;
        clearTimeout(timer);
      };
    }

    // Not on this page of results: ask the API which task the slug belongs to.
    apiClient.tasks
      .getTaskBySlug(workspaceId, slug)
      .then((res: any) => {
        if (!res?.success || !res.data) return;
        reveal(res.data);
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, [slug, workspaceId]);

  // 2. Once the sheet is out of the way, find the row and blink it.
  useEffect(() => {
    if (!pendingTaskId || isSheetOpen) return;

    let cancelled = false;
    const timers: number[] = [];
    let attempts = 0;

    const look = () => {
      if (cancelled) return;

      const row = document.querySelector<HTMLElement>(`[data-task-id="${pendingTaskId}"]`);
      if (!row) {
        if (++attempts < POLL_ATTEMPTS) timers.push(window.setTimeout(look, POLL_MS));
        return;
      }

      row.scrollIntoView({ behavior: "smooth", block: "center" });
      row.classList.remove("task-blink");
      void row.offsetWidth; // restart the animation if the class is re-applied
      row.classList.add("task-blink");
      timers.push(
        window.setTimeout(() => {
          row.classList.remove("task-blink");
          setPendingTaskId(null);
        }, BLINK_MS)
      );
    };

    look();

    return () => {
      cancelled = true;
      timers.forEach(clearTimeout);
    };
  }, [pendingTaskId, isSheetOpen]);
}
