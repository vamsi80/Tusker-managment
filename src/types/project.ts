/**
 * Types for project-related data
 */

export type ProjectRole = "LEAD" | "MEMBER" | "VIEWER" | "PROJECT_MANAGER" | "PROJECT_COORDINATOR";

/** Mirrors the ProjectCategory enum in schema.prisma. Null on projects created
 *  before categories existed. */
export type ProjectCategory = "WHITE_TUSKER" | "LATTICE_LANE" | "MISCELLANEOUS";

export type ProjectMemberUI = {
  id: string; // userId
  userId: string;
  projectId?: string;
  projectRole: ProjectRole;
  projectMemberId: string;
  user: {
    id: string;
    name: string | null;
    surname: string | null;
    email: string | null;
  };
  workspaceRole?: string;
};

export type ProjectMembersType = ProjectMemberUI[];

export interface ProjectMember {
  id: string;
  userId: string;
  userName: string;
  projectRole: ProjectRole;
  hasAccess: boolean;
}

export interface MinimalProjectData {
  id: string;
  name: string;
  slug: string;
  color: string | null;
}

export interface ProjectListItem extends MinimalProjectData {
  canManageMembers: boolean;
  projectRole?: ProjectRole;
  createdAt: string;
  projectManager?: { id: string; surname: string | null };
  category: ProjectCategory | null;
}

export interface FullProjectData extends MinimalProjectData {
  description: string | null;
  workspaceId: string;
  // Team data
  projectManagerId: string | null;
  projectManager?: { id: string; surname: string | null };
  memberAccess: string[];
  // Project members
  projectMembers?: ProjectMember[];
  // Client data
  companyName?: string | null;
  registeredCompanyName?: string | null;
  directorName?: string | null;
  address?: string | null;
  gstNumber?: string | null;
  contactPerson?: string | null;
  phoneNumber?: string | null;
  tagIds?: string[];
  category: ProjectCategory | null;
}

export type ProjectReviewer = {
  id: string;
  surname: string;
  role: string;
};
