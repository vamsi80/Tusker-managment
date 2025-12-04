"use client";

import React, { createContext, useContext, useState, useCallback } from "react";
import { TaskWithSubTasks } from "./table/types";

interface TaskContextType {
    addNewTask: (task: TaskWithSubTasks) => void;
    isAddingTask: boolean;
    setIsAddingTask: (loading: boolean) => void;
}

const TaskContext = createContext<TaskContextType | undefined>(undefined);

export function useTaskContext() {
    const context = useContext(TaskContext);
    if (!context) {
        throw new Error("useTaskContext must be used within TaskProvider");
    }
    return context;
}

interface TaskProviderProps {
    children: React.ReactNode;
    onAddTask: (task: TaskWithSubTasks) => void;
}

export function TaskProvider({ children, onAddTask }: TaskProviderProps) {
    const [isAddingTask, setIsAddingTask] = useState(false);

    const addNewTask = useCallback((task: TaskWithSubTasks) => {
        onAddTask(task);
        setIsAddingTask(false);
    }, [onAddTask]);

    return (
        <TaskContext.Provider value={{ addNewTask, isAddingTask, setIsAddingTask }}>
            {children}
        </TaskContext.Provider>
    );
}
