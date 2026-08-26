import { createContext } from "react";
import type { ProjectMembersType } from "@/types/project";
import type { UserPermissionsType } from "@/types/workspace";

export interface ProjectLayoutContextType {
    projectMembers: ProjectMembersType;
    projectPermissions: UserPermissionsType;
    projectManagers: Record<string, any[]>;
    workspaceTags: any[];
    workspaceId: string;
    projectId: string;
    isLoading: boolean;
    expandedTasks: Record<string, boolean>;
    setExpandedTasks: (val: Record<string, boolean> | ((prev: Record<string, boolean>) => Record<string, boolean>)) => void;
    revalidate: () => Promise<void>;
}

export const ProjectLayoutContext = createContext<ProjectLayoutContextType | null>(null);
