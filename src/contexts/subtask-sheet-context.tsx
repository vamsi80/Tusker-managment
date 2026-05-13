"use client";

import { createContext, useContext, useState, useCallback, useMemo } from "react";
import { usePathname, useSearchParams, useRouter } from "next/navigation";

interface SubTaskSheetContextType {
    subTask: any | null;
    isOpen: boolean;
    openSubTaskSheet: (task: any) => void;
    openSubTaskSheetLoading: () => void;
    closeSubTaskSheet: () => void;
    patchSubTask: (updatedData: any) => void;
}

const SubTaskSheetContext = createContext<SubTaskSheetContextType | null>(null);

export function SubTaskSheetProvider({ children }: { children: React.ReactNode }) {
    const [subTask, setSubTask] = useState<any | null>(null);
    const [isOpen, setIsOpen] = useState(false);
    
    const pathname = usePathname();
    const searchParams = useSearchParams();
    const router = useRouter();

    const openSubTaskSheet = useCallback((task: any) => {
        setSubTask(task);
        setIsOpen(true);
    }, []);

    const openSubTaskSheetLoading = useCallback(() => {
        setSubTask(null);
        setIsOpen(true);
    }, []);

    const closeSubTaskSheet = useCallback(() => {
        setIsOpen(false);
        // Delay clearing task for exit animation
        setTimeout(() => setSubTask(null), 250);
    }, []);

    const patchSubTask = useCallback((updatedData: any) => {
        setSubTask((prev: any) => {
            if (!prev) return prev;
            return { ...prev, ...updatedData };
        });
    }, []);

    const value = useMemo(() => ({
        subTask,
        isOpen,
        openSubTaskSheet,
        openSubTaskSheetLoading,
        closeSubTaskSheet,
        patchSubTask
    }), [subTask, isOpen, openSubTaskSheet, openSubTaskSheetLoading, closeSubTaskSheet, patchSubTask]);

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

