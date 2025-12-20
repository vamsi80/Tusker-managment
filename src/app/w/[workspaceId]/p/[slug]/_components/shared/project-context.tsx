"use client";

import { createContext, useContext } from "react";
import { TaskPageDataType } from "@/data/task/get-task-page-data";

interface ProjectContextType {
    pageData: NonNullable<TaskPageDataType>;
}

const ProjectContext = createContext<ProjectContextType | null>(null);

export function ProjectProvider({
    children,
    pageData,
}: {
    children: React.ReactNode;
    pageData: NonNullable<TaskPageDataType>;
}) {
    return (
        <ProjectContext.Provider value={{ pageData }}>
            {children}
        </ProjectContext.Provider>
    );
}

export function useProject() {
    const context = useContext(ProjectContext);
    if (!context) {
        throw new Error("useProject must be used within ProjectProvider");
    }
    return context.pageData;
}
