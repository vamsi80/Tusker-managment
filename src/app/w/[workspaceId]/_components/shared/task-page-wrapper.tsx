"use client";

import { useState, useCallback, createContext, useContext } from "react";
import { TaskWithSubTasks } from "@/components/task/shared/types";
import { TaskProvider } from "./task-context";

interface TaskPageWrapperProps {
    children: React.ReactNode;
}

interface NewTaskContextType {
    newTask: TaskWithSubTasks | null;
    clearNewTask: () => void;
}

const NewTaskContext = createContext<NewTaskContextType | undefined>(undefined);

export function useNewTask() {
    const context = useContext(NewTaskContext);
    if (!context) {
        throw new Error("useNewTask must be used within TaskPageWrapper");
    }
    return context;
}

export function TaskPageWrapper({ children }: TaskPageWrapperProps) {
    const [newTask, setNewTask] = useState<TaskWithSubTasks | null>(null);

    const handleAddTask = useCallback((task: TaskWithSubTasks) => {
        setNewTask(task);
    }, []);

    const clearNewTask = useCallback(() => {
        setNewTask(null);
    }, []);

    return (
        <NewTaskContext.Provider value={{ newTask, clearNewTask }}>
            <TaskProvider onAddTask={handleAddTask}>
                {children}
            </TaskProvider>
        </NewTaskContext.Provider>
    );
}
