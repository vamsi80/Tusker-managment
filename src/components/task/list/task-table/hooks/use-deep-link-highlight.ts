"use client";

import { useEffect, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { apiClient } from "@/lib/api-client";

const BLINK_MS = 3000; // .task-blink runs 0.6s five times
const POLL_MS = 200;
const POLL_ATTEMPTS = 25; // give the row ~5s to arrive (subtasks load on demand)

/**
 * Reveals the task a deep link points at (`?subtask=<slug>`, used by the
 * calendar and notifications): expands its parent row so a subtask is not
 * hidden inside a collapsed group, scrolls it into view, and blinks it.
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
  const slug = searchParams.get("subtask");
  const handledSlugRef = useRef<string | null>(null);

  // Held in refs so the effect depends on the slug alone. Re-running it because
  // a caller re-created `setExpanded` would cancel the pending blink and then
  // skip it, since the slug is already marked as handled.
  const tasksRef = useRef(tasks);
  const setExpandedRef = useRef(setExpanded);
  const requestSubtasksRef = useRef(requestSubtasks);
  tasksRef.current = tasks;
  setExpandedRef.current = setExpanded;
  requestSubtasksRef.current = requestSubtasks;

  useEffect(() => {
    if (!slug || !workspaceId || handledSlugRef.current === slug) return;
    handledSlugRef.current = slug;

    let cancelled = false;
    let timers: number[] = [];

    const blink = (taskId: string) => {
      let attempts = 0;

      const look = () => {
        if (cancelled) return;

        const row = document.querySelector<HTMLElement>(`[data-task-id="${taskId}"]`);
        if (!row) {
          if (++attempts < POLL_ATTEMPTS) timers.push(window.setTimeout(look, POLL_MS));
          return;
        }

        row.scrollIntoView({ behavior: "smooth", block: "center" });
        row.classList.add("task-blink");
        timers.push(window.setTimeout(() => row.classList.remove("task-blink"), BLINK_MS));
      };

      look();
    };

    const reveal = (task: { id: string; parentTaskId?: string | null }) => {
      if (task.parentTaskId) {
        setExpandedRef.current((prev: Record<string, boolean>) => ({
          ...prev,
          [task.parentTaskId!]: true,
        }));
        requestSubtasksRef.current(task.parentTaskId);
      }
      blink(task.id);
    };

    const loaded = tasksRef.current?.find((t) => t.taskSlug === slug);
    if (loaded) {
      reveal(loaded);
      return () => {
        cancelled = true;
        timers.forEach(clearTimeout);
      };
    }

    // Not on this page of results (or it is a subtask of a collapsed parent):
    // ask the API which task the slug belongs to.
    apiClient.tasks
      .getTaskBySlug(workspaceId, slug)
      .then((res: any) => {
        if (cancelled || !res?.success || !res.data) return;
        reveal(res.data);
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
      timers.forEach(clearTimeout);
    };
  }, [slug, workspaceId]);
}
