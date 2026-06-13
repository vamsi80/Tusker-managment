"use client";

import { createContext, useContext, useState, useCallback, useMemo, useEffect, useRef } from "react";
import { usePathname, useSearchParams, useRouter } from "next/navigation";

interface SubTaskSheetContextType {
    subTask: Record<string, unknown> | null;
    isOpen: boolean;
    openSubTaskSheet: (task: Record<string, unknown>) => void;
    openSubTaskSheetLoading: () => void;
    closeSubTaskSheet: () => void;
    patchSubTask: (updatedData: Record<string, unknown>) => void;
}

const SubTaskSheetContext = createContext<SubTaskSheetContextType | null>(null);

export function SubTaskSheetProvider({ children }: { children: React.ReactNode }) {
    const pathname = usePathname();
    const searchParams = useSearchParams();
    const [subTask, setSubTask] = useState<Record<string, unknown> | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    
    // 🚀 Soft Navigation: Use local state for slug to avoid full page re-renders
    const [subtaskSlug, setSubtaskSlug] = useState<string | null>(searchParams.get("subtask"));
    const isOpen = !!subtaskSlug;
    
    const lastLoadedSlugRef = useRef<string | null>(null);

    // Sync local slug state when searchParams change (e.g. on mount or browser back/forward)
    useEffect(() => {
        const slug = searchParams.get("subtask");
        if (slug !== subtaskSlug) {
            console.log("DEBUG [SubTaskSheet] Syncing subtaskSlug from URL:", slug);
            setSubtaskSlug(slug);
        }
    }, [searchParams]);

    const openSubTaskSheet = useCallback((task: Record<string, unknown>) => {
        console.log("DEBUG [SubTaskSheet] Opening task:", task.taskSlug || task.id);
        const slug = String(task.taskSlug || task.id || "");
        
        const params = new URLSearchParams(searchParams.toString());
        params.set("subtask", slug);
        const newUrl = `${pathname}?${params.toString()}`;
        
        // 🚀 SOFT NAV: Use history.replaceState to avoid server re-render (blank screen)
        window.history.replaceState({ ...window.history.state, as: newUrl, url: newUrl }, "", newUrl);
        setSubtaskSlug(slug);
        
        // Optimistically set the data if we have it
        setSubTask(task);
        
        // If it's a fully loaded task, set lastLoadedSlugRef.current.
        // If it's missing workspaceId (meaning it's partial), don't set lastLoadedSlugRef.current so it triggers API fetch.
        if (task && task.workspaceId && task.projectId) {
            lastLoadedSlugRef.current = slug;
        } else {
            lastLoadedSlugRef.current = null;
        }
    }, [pathname, searchParams]);

    const openSubTaskSheetLoading = useCallback(() => {
        // No-op for the direct call, visibility is derived from URL
    }, []);

    const closeSubTaskSheet = useCallback(() => {
        console.log("DEBUG [SubTaskSheet] closeSubTaskSheet triggered. Animating out...");
        const params = new URLSearchParams(searchParams.toString());
        params.delete("subtask");
        params.delete("tab");
        const newUrl = params.toString() ? `${pathname}?${params.toString()}` : pathname;
        
        // 🚀 SOFT NAV: Use history.replaceState to avoid server re-render (blank screen)
        window.history.replaceState({ ...window.history.state, as: newUrl, url: newUrl }, "", newUrl);
        setSubtaskSlug(null);
        
        // Delay clearing task to match exit animation (prevent vanishing)
        setTimeout(() => {
            console.log("DEBUG [SubTaskSheet] Animation finished. Clearing subTask state.");
            setSubTask(null);
            lastLoadedSlugRef.current = null;
        }, 300);
    }, [pathname, searchParams]);

    // 🚀 Deep-Linking & Auto-Hydration: Single Source of Truth is the URL
    useEffect(() => {
        if (!subtaskSlug) {
            if (subTask) {
                console.log("DEBUG [SubTaskSheet] URL slug removed. Clearing subTask state.");
                setSubTask(null);
            }
            lastLoadedSlugRef.current = null;
            return;
        }

        if (subtaskSlug === lastLoadedSlugRef.current) return;

        console.log("DEBUG [SubTaskSheet] URL slug detected:", subtaskSlug, ". Fetching data...");
        const workspaceIdMatch = pathname.match(/\/w\/([^\/]+)/);
        const workspaceId = workspaceIdMatch ? workspaceIdMatch[1] : null;

        if (workspaceId) {
            setIsLoading(true);
            setSubTask(null); 

            import("@/lib/api-client").then(({ apiClient }) => {
                apiClient.tasks.getTaskBySlug(workspaceId, subtaskSlug).then(result => {
                    if (result.success && result.data) {
                        console.log("DEBUG [SubTaskSheet] Data fetched successfully for:", subtaskSlug);
                        setSubTask(result.data);
                        lastLoadedSlugRef.current = subtaskSlug;
                    } else {
                        console.error("DEBUG [SubTaskSheet] Failed to fetch data for:", subtaskSlug);
                        closeSubTaskSheet();
                    }
                }).catch((err) => {
                    console.error("DEBUG [SubTaskSheet] Error fetching data:", err);
                    closeSubTaskSheet();
                })
                  .finally(() => setIsLoading(false));
            });
        }
    }, [subtaskSlug, pathname, closeSubTaskSheet]);

    const patchSubTask = useCallback((updatedData: Record<string, unknown>) => {
        setSubTask((prev) => {
            if (!prev) return prev;
            return { ...prev, ...updatedData };
        });
    }, []);

    const value = useMemo(() => ({
        subTask,
        isOpen,
        isLoading,
        openSubTaskSheet,
        openSubTaskSheetLoading,
        closeSubTaskSheet,
        patchSubTask
    }), [subTask, isOpen, isLoading, openSubTaskSheet, openSubTaskSheetLoading, closeSubTaskSheet, patchSubTask]);

    return (
        <SubTaskSheetContext.Provider value={value}>
            {children}
        </SubTaskSheetContext.Provider>
    );
}

export function useSubTaskSheet() {
    const context = useContext(SubTaskSheetContext);
    if (!context) {
        throw new Error("useSubTaskSheet must be used within a SubTaskSheetProvider");
    }
    return context;
}

export function useSubTaskSheetActions() {
    return useSubTaskSheet();
}

