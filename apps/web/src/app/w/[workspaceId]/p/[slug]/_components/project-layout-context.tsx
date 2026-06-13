"use client";

import { useContext, ReactNode, useState, useEffect, useCallback } from "react";
import { projectsClient } from "@/lib/api-client/projects";
import { ProjectMembersType } from "@/types/project";
import type { UserPermissionsType } from "@/types/workspace";
import { useWorkspaceLayout } from "@/app/w/[workspaceId]/_components/workspace-layout-context";

import { ProjectLayoutContext, type ProjectLayoutContextType } from "./project-layout-context-object";

import { useProjectTags } from "@/hooks/use-project-tags";

export function ProjectLayoutProvider({
    children,
    workspaceId,
    projectId,
}: {
    children: ReactNode;
    workspaceId: string;
    projectId: string;
}) {
    const { data: workspaceData } = useWorkspaceLayout();
    const [projectMembers, setProjectMembers] = useState<ProjectMembersType>([]);
    const [projectPermissions, setProjectPermissions] = useState<UserPermissionsType | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [expandedTasks, setExpandedTasks] = useState<Record<string, boolean>>({});

    const projectTags = useProjectTags(workspaceId, projectId);

    const fetchProjectData = useCallback(async (isSilent = false) => {
        if (!projectId) return;

        try {
            if (!isSilent) setIsLoading(true);
            const res = await projectsClient.getLayoutData(workspaceId, projectId);

            setProjectMembers((res.members as ProjectMembersType) || []);
            setProjectPermissions((res.permissions as UserPermissionsType) || null);
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
        projectManagers: workspaceData.projectManagers || {},
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
            userSurname: null,
            projectMember: null,
        },
        workspaceTags: projectTags || [],
        workspaceId,
        projectId,
        isLoading,
        expandedTasks,
        setExpandedTasks,
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

export function useOptionalProjectLayout() {
    return useContext(ProjectLayoutContext);
}
