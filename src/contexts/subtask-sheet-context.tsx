import { useSubTaskSheetStore } from "@/lib/store/subtask-sheet-store";
import { usePathname, useSearchParams } from "next/navigation";
import { useCallback } from "react";

/**
 * DEPRECATED: Use useSubTaskSheetStore directly for state.
 * This hook is maintained for backward compatibility.
 */
export function useSubTaskSheet() {
    const store = useSubTaskSheetStore();
    const actions = useSubTaskSheetActions();
    
    return {
        ...store,
        ...actions
    };
}

/**
 * Optimized hook for components that ONLY need to open/close the sheet.
 * Automatically handles URL synchronization when opening/closing.
 * 
 * Works WITHOUT a Provider.
 */
export function useSubTaskSheetActions() {
    const store = useSubTaskSheetStore();
    const pathname = usePathname();
    const searchParams = useSearchParams();

    const openSubTaskSheet = useCallback((task: any) => {
        const slug = task?.taskSlug || task?.id;
        const params = new URLSearchParams(searchParams.toString());

        if (slug && params.get("subtask") !== slug) {
            params.set("subtask", slug);
            window.history.replaceState(null, "", `${pathname}?${params.toString()}`);
        }

        store.openSubTaskSheet(task);
    }, [store.openSubTaskSheet, pathname, searchParams]);

    const openSubTaskSheetLoading = useCallback(() => {
        store.openSubTaskSheetLoading();
    }, [store.openSubTaskSheetLoading]);

    const closeSubTaskSheet = useCallback(() => {
        const params = new URLSearchParams(searchParams.toString());
        if (params.has("subtask")) {
            params.delete("subtask");
            const newUrl = params.toString() ? `${pathname}?${params.toString()}` : pathname;
            window.history.replaceState(null, "", newUrl);
        }
        store.closeSubTaskSheet();
    }, [store.closeSubTaskSheet, pathname, searchParams]);

    return {
        ...store,
        openSubTaskSheet,
        openSubTaskSheetLoading,
        closeSubTaskSheet,
        patchSubTask: store.patchSubTask
    };
}

// Dummy provider for backward compatibility
export function SubTaskSheetProvider({ children }: { children: React.ReactNode }) {
    return <>{children}</>;
}

