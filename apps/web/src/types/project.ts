export type {
    ProjectRole,
    ProjectMemberUI,
    ProjectMembersType,
    ProjectMember,
    MinimalProjectData,
    ProjectListItem,
    FullProjectData,
    ProjectReviewer,
} from "@tusker/types/project";

import type { ProjectMembersType } from "@tusker/types/project";
import type { UserPermissionsType } from "@tusker/types/workspace";

/**
 * UI context contract for the project layout (members, permissions, managers,
 * tags, and view state). Web-only — lives here as the dedicated home rather than
 * inline in the context-object module.
 */
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
