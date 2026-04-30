/**
 * Types for project-related data
 */

export type ProjectRole = "LEAD" | "MEMBER" | "VIEWER" | "PROJECT_MANAGER";

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
    email?: string;
    image?: string | null;
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
}

export interface FullProjectData extends MinimalProjectData {
  description: string | null;
  workspaceId: string;
  // Team data
  projectLead: string | null;
  projectManagers: string[];
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
}

export type ProjectReviewer = {
  id: string;
  surname: string;
  role: string;
};
