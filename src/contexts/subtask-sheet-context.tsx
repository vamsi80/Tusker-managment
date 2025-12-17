"use client";

import { createContext, useContext, useState, ReactNode } from "react";

interface SubTaskSheetContextType {
    openSubTaskSheet: (subTask: any) => void;
    closeSubTaskSheet: () => void;
    subTask: any | null;
    isOpen: boolean;
}

const SubTaskSheetContext = createContext<SubTaskSheetContextType | undefined>(undefined);

export function SubTaskSheetProvider({ children }: { children: ReactNode }) {
    const [subTask, setSubTask] = useState<any | null>(null);
    const [isOpen, setIsOpen] = useState(false);

    const openSubTaskSheet = (subTask: any) => {
        setSubTask(subTask);
        setIsOpen(true);
    };

    const closeSubTaskSheet = () => {
        setIsOpen(false);
        setSubTask(null);
    };

    return (
        <SubTaskSheetContext.Provider
            value={{
                openSubTaskSheet,
                closeSubTaskSheet,
                subTask,
                isOpen,
            }}
        >
            {children}
        </SubTaskSheetContext.Provider>
    );
}

export function useSubTaskSheet() {
    const context = useContext(SubTaskSheetContext);
    if (!context) {
        throw new Error("useSubTaskSheet must be used within SubTaskSheetProvider");
    }
    return context;
}
