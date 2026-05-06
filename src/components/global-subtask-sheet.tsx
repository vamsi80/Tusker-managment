"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef } from "react";
import { useSubTaskSheet } from "@/contexts/subtask-sheet-context";
const SubTaskDetailsSheet = dynamic(() => import("@/app/w/[workspaceId]/p/[slug]/_components/shared/subtaskSheet/subtask-details-sheet").then(mod => mod.SubTaskDetailsSheet), {
    ssr: false,
    loading: () => null
});
import { useSearchParams, useParams } from "next/navigation";
import { apiClient } from "@/lib/api-client";


export function GlobalSubTaskSheet() {
    const { isOpen, subTask, openSubTaskSheet, openSubTaskSheetLoading, closeSubTaskSheet, patchSubTask } = useSubTaskSheet();
    const searchParams = useSearchParams();
    const params = useParams();
    const workspaceId = params.workspaceId as string;
    const subTaskSlug = searchParams.get("subtask");

    const lastFetchedSlug = useRef<string | null>(null);

    useEffect(() => {
        if (!workspaceId && subTaskSlug) {
            console.warn("[GlobalSubTaskSheet] Missing workspaceId in params, cannot fetch task.");
        }
        
        if (subTaskSlug && workspaceId) {
            const currentSlug = subTask?.taskSlug || subTask?.id;

            // Trigger fetch if this slug hasn't been fetched in this session
            if (lastFetchedSlug.current !== subTaskSlug) {
                console.log(`🚀 [GlobalSubTaskSheet] Fetching fresh data for: ${subTaskSlug}`);
                lastFetchedSlug.current = subTaskSlug;

                // Only show loader if we don't already have some version of this task
                if (currentSlug !== subTaskSlug) {
                    openSubTaskSheetLoading();
                }

                const loadTask = async () => {
                    try {
                        const result = await apiClient.tasks.getTaskBySlug(workspaceId, subTaskSlug);
                        if (result.success && result.data) {
                            console.log("[GlobalSubTaskSheet] Fresh data received.");
                            openSubTaskSheet(result.data);
                        } else if (result.error) {
                            console.error("Failed to fetch subtask context:", result.error);
                        }
                    } catch (err) {
                        console.error("[GlobalSubTaskSheet] Fetch error:", err);
                    }
                };

                loadTask();
            }
        } else if (!subTaskSlug && isOpen) {
            console.log("[GlobalSubTaskSheet] No slug, closing sheet.");
            closeSubTaskSheet();
            lastFetchedSlug.current = null;
        }
    }, [subTaskSlug, workspaceId, isOpen, subTask?.id, subTask?.taskSlug, openSubTaskSheet, openSubTaskSheetLoading, closeSubTaskSheet]);

    return (
        <SubTaskDetailsSheet
            subTask={subTask}
            isOpen={isOpen}
            onClose={closeSubTaskSheet}
            onSubTaskAssigned={patchSubTask}
        />
    );
}
