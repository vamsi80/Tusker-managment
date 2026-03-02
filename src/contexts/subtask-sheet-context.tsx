"use client";

import { createContext, useContext, useState, ReactNode, useCallback, useMemo } from "react";

interface SubTaskSheetState {
    subTask: any | null;
    isOpen: boolean;
}

interface SubTaskSheetActions {
    openSubTaskSheet: (subTask: any) => void;
    closeSubTaskSheet: () => void;
}

const SubTaskSheetStateContext = createContext<SubTaskSheetState | undefined>(undefined);
const SubTaskSheetActionsContext = createContext<SubTaskSheetActions | undefined>(undefined);

export function SubTaskSheetProvider({ children }: { children: ReactNode }) {
    const [subTask, setSubTask] = useState<any | null>(null);
    const [isOpen, setIsOpen] = useState(false);

    const openSubTaskSheet = useCallback((task: any) => {
        if (typeof window !== 'undefined') {
            (window as any).lastSheetOpenClick = performance.now();
        }
        setSubTask(task);
        setIsOpen(true);
    }, []);

    const closeSubTaskSheet = useCallback(() => {
        setIsOpen(false);
        setTimeout(() => {
            setSubTask(null);
        }, 250);
    }, []);

    const state = useMemo(() => ({ subTask, isOpen }), [subTask, isOpen]);
    const actions = useMemo(() => ({ openSubTaskSheet, closeSubTaskSheet }), [openSubTaskSheet, closeSubTaskSheet]);

    return (
        <SubTaskSheetStateContext.Provider value={state}>
            <SubTaskSheetActionsContext.Provider value={actions}>
                {children}
            </SubTaskSheetActionsContext.Provider>
        </SubTaskSheetStateContext.Provider>
    );
}

export function useSubTaskSheet() {
    const state = useContext(SubTaskSheetStateContext);
    const actions = useSubTaskSheetActions();

    if (!state) {
        throw new Error("useSubTaskSheet must be used within SubTaskSheetProvider");
    }

    return { ...state, ...actions };
}

import { usePathname, useSearchParams } from "next/navigation";

/**
 * Optimized hook for components that ONLY need to open/close the sheet.
 * Calling this won't trigger re-renders when the sheet state changes.
 * 
 * Automatically handles URL synchronization when opening/closing.
 */
export function useSubTaskSheetActions() {
    const context = useContext(SubTaskSheetActionsContext);
    const pathname = usePathname();
    const searchParams = useSearchParams();

    if (!context) {
        throw new Error("useSubTaskSheetActions must be used within SubTaskSheetProvider");
    }

    const { openSubTaskSheet: originalOpen, closeSubTaskSheet: originalClose } = context;

    const openSubTaskSheet = useCallback((task: any) => {
        const slug = task.taskSlug || task.id;
        const params = new URLSearchParams(searchParams.toString());

        if (params.get("subtask") !== slug) {
            params.set("subtask", slug);
            window.history.replaceState(null, "", `${pathname}?${params.toString()}`);
        }

        originalOpen(task);
    }, [originalOpen, pathname, searchParams]);

    const closeSubTaskSheet = useCallback(() => {
        const params = new URLSearchParams(searchParams.toString());
        if (params.has("subtask")) {
            params.delete("subtask");
            const newUrl = params.toString() ? `${pathname}?${params.toString()}` : pathname;
            window.history.replaceState(null, "", newUrl);
        }
        originalClose();
    }, [originalClose, pathname, searchParams]);

    return { ...context, openSubTaskSheet, closeSubTaskSheet };
}
