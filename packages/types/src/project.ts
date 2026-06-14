export type ProjectRole = "LEAD" | "MEMBER" | "VIEWER" | "PROJECT_MANAGER" | "PROJECT_COORDINATOR";

export type ProjectMemberUI = {
  id: string;
  userId: string;
  projectId?: string;
  projectRole: ProjectRole;
  projectMemberId: string;
  user: {
    id: string;
    name: string | null;
    surname: string;
    email: string | null;
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
  projectRole?: ProjectRole;
  createdAt: string;
  projectManager?: { id: string; surname: string };
  memberIds?: string[];
}

export interface FullProjectData extends MinimalProjectData {
  description: string | null;
  workspaceId: string;
  projectManagerId: string | null;
  projectManager?: { id: string; surname: string };
  memberAccess: string[];
  projectMembers?: ProjectMember[];
  companyName?: string | null;
  registeredCompanyName?: string | null;
  directorName?: string | null;
  address?: string | null;
  gstNumber?: string | null;
  contactPerson?: string | null;
  phoneNumber?: string | null;
  tagIds?: string[];
}

export type ProjectReviewer = {
  id: string;
  surname: string;
  role: string;
};
