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
        setSubTask(task);
        setIsOpen(true);
    }, []);

    const closeSubTaskSheet = useCallback(() => {
        setIsOpen(false);
        // Don't clear subTask immediately to avoid layout shifts during sheet closing animation
        setTimeout(() => {
            setSubTask(null);
        }, 500);
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
    const actions = useContext(SubTaskSheetActionsContext);
    if (!state || !actions) {
        throw new Error("useSubTaskSheet must be used within SubTaskSheetProvider");
    }
    return { ...state, ...actions };
}

/**
 * Optimized hook for components that ONLY need to open/close the sheet.
 * Calling this won't trigger re-renders when the sheet state changes.
 */
export function useSubTaskSheetActions() {
    const context = useContext(SubTaskSheetActionsContext);
    if (!context) {
        throw new Error("useSubTaskSheetActions must be used within SubTaskSheetProvider");
    }
    return context;
}
