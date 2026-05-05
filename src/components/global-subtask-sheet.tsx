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
            console.log(`🔍 [GlobalSubTaskSheet] Comparing: StoreSlug="${currentSlug}", UrlSlug="${subTaskSlug}"`);

            if (currentSlug !== subTaskSlug && lastFetchedSlug.current !== subTaskSlug) {
                console.log("🚀 [GlobalSubTaskSheet] Slug mismatch - triggering load...");
                lastFetchedSlug.current = subTaskSlug;

                openSubTaskSheetLoading();

                const loadTask = async () => {
                    const result = await apiClient.tasks.getTaskBySlug(workspaceId, subTaskSlug);
                    if (result.success && result.data) {
                        openSubTaskSheet(result.data);
                    } else if (result.error) {
                        console.error("Failed to fetch subtask context:", result.error);
                    }
                };

                loadTask();
            }
        } else if (!subTaskSlug && isOpen) {
            closeSubTaskSheet();
            lastFetchedSlug.current = null;
        }
    }, [subTaskSlug, subTask, workspaceId, isOpen, openSubTaskSheet, openSubTaskSheetLoading, closeSubTaskSheet]);

    return (
        <SubTaskDetailsSheet
            subTask={subTask}
            isOpen={isOpen}
            onClose={closeSubTaskSheet}
            onSubTaskAssigned={patchSubTask}
        />
    );
}
