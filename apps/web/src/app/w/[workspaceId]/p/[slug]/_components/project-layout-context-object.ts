import { createContext } from "react";
import type { ProjectMembersType } from "@/types/project";
import type { UserPermissionsType } from "@/types/workspace";

export interface ProjectLayoutContextType {
    projectMembers: ProjectMembersType;
    projectPermissions: UserPermissionsType;
    projectManagers: Record<string, Array<{ id?: string; surname?: string | null; name?: string | null; image?: string | null; user?: { image?: string | null; surname?: string | null; name?: string | null } }>>;
    workspaceTags: Array<{ id: string; name: string }>;
    workspaceId: string;
    projectId: string;
    isLoading: boolean;
    expandedTasks: Record<string, boolean>;
    setExpandedTasks: (val: Record<string, boolean> | ((prev: Record<string, boolean>) => Record<string, boolean>)) => void;
    revalidate: () => Promise<void>;
}

export const ProjectLayoutContext = createContext<ProjectLayoutContextType | null>(null);
