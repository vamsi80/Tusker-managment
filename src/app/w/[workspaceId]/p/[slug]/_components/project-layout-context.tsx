"use client";

import React, { createContext, useContext, ReactNode, useState, useEffect, useCallback } from "react";
import { projectsClient } from "@/lib/api-client/projects";
import type { ProjectMembersType } from "@/data/project/get-project-members";
import type { UserPermissionsType } from "@/data/user/get-user-permissions";

interface ProjectLayoutContextType {
    projectMembers: ProjectMembersType;
    projectPermissions: UserPermissionsType;
    workspaceTags: any[];
    workspaceId: string;
    projectId: string;
    isLoading: boolean;
    revalidate: () => Promise<void>;
}

const ProjectLayoutContext = createContext<ProjectLayoutContextType | null>(null);

export function ProjectLayoutProvider({
    children,
    workspaceId,
    projectId,
}: {
    children: ReactNode;
    workspaceId: string;
    projectId: string;
}) {
    const [projectMembers, setProjectMembers] = useState<ProjectMembersType>([]);
    const [projectPermissions, setProjectPermissions] = useState<UserPermissionsType | null>(null);
    const [workspaceTags, setWorkspaceTags] = useState<any[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    const fetchProjectData = useCallback(async (isSilent = false) => {
        if (!projectId) return;
        
        try {
            if (!isSilent) setIsLoading(true);
            const res = await projectsClient.getLayoutData(workspaceId, projectId);

            setProjectMembers(res.data?.members || []);
            setProjectPermissions(res.data?.permissions || null);
            setWorkspaceTags(res.data?.tags || []);
        } catch (error) {
            console.error("Failed to fetch project layout data:", error);
        } finally {
            if (!isSilent) setIsLoading(false);
        }
    }, [workspaceId, projectId]);

    const revalidate = useCallback(async () => {
        await fetchProjectData(true);
    }, [fetchProjectData]);

    useEffect(() => {
        fetchProjectData();
    }, [fetchProjectData]);

    const contextValue: ProjectLayoutContextType = {
        projectMembers,
        projectPermissions: projectPermissions || {
            isWorkspaceAdmin: false,
            isProjectManager: false,
            isProjectLead: false,
            isMember: false,
            canCreateSubTask: false,
            canPerformBulkOperations: false,
            workspaceMemberId: null,
            workspaceRole: null,
            userId: null,
        },
        workspaceTags,
        workspaceId,
        projectId,
        isLoading,
        revalidate
    };

    return (
        <ProjectLayoutContext.Provider value={contextValue}>
            {children}
        </ProjectLayoutContext.Provider>
    );
}

export function useProjectLayout() {
    const context = useContext(ProjectLayoutContext);
    if (!context) {
        throw new Error("useProjectLayout must be used within a ProjectLayoutProvider");
    }
    return context;
}
