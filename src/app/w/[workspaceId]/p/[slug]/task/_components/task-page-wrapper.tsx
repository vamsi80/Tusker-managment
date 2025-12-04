"use client";

import { useState, useCallback } from "react";
import { TaskProvider } from "./task-context";
import { TaskWithSubTasks } from "./table/types";

interface TaskPageWrapperProps {
    children: React.ReactNode;
}

export function TaskPageWrapper({ children }: TaskPageWrapperProps) {
    const [tasks, setTasks] = useState<TaskWithSubTasks[]>([]);

    const handleAddTask = useCallback((newTask: TaskWithSubTasks) => {
        setTasks(prev => [newTask, ...prev]);
    }, []);

    return (
        <TaskProvider onAddTask={handleAddTask}>
            {children}
        </TaskProvider>
    );
}
