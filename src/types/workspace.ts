
/**
 * Types for workspace data
 */
export type WorkspaceRole = "ADMIN" | "OWNER" | "MANAGER" | "MEMBER" | "VIEWER";
export type WorkspaceData = {
  id: string;
  name: string;
  description: string | null;
  slug: string;
  ownerId: string;
  createdAt: Date;
  updatedAt: Date;
  // Business info fields
  legalName?: string | null;
  gstNumber?: string | null;
  panNumber?: string | null;
  companyType?: string | null;
  industry?: string | null;
  msmeNumber?: string | null;
  email?: string | null;
  phone?: string | null;
  website?: string | null;
  addressLine1?: string | null;
  addressLine2?: string | null;
  city?: string | null;
  state?: string | null;
  country?: string | null;
  pincode?: string | null;
  members?: any[];
};

export type WorkspaceMemberRow = {
  id: string;
  workspaceId: string;
  userId: string;
  workspaceRole: WorkspaceRole;
  designation?: string | null;
  reportToId?: string | null;
  user?: {
    id: string;
    name?: string | null;
    surname: string;
    email: string;
    emailVerified: boolean;
    phoneNumber?: string | null;
    image?: string | null;
    _count?: {
      accounts: number;
    };
  } | null;
  reportTo?: {
    user: {
      surname: string | null;
    };
  } | null;
};

export type WorkspaceListItem = {
  id: string;
  name: string;
  slug: string | null;
  ownerId: string;
  createdAt: Date;
  updatedAt: Date;
  workspaceRole: any;
  memberCount?: number;
};

export type WorkspacesResult = {
  workspaces: WorkspaceListItem[];
  totalCount: number;
};

export type WorkspaceMembersResult = {
  workspaceMembers: WorkspaceMemberRow[];
};

export interface WorkspaceLayoutData {
  workspaces: WorkspacesResult;
  metadata?: any;
  projects: any[];
  tags: any[];
  projectManagers: Record<string, any[]>;
  unreadNotificationsCount: number;
  permissions: {
    isWorkspaceAdmin: boolean;
    canCreateProject: boolean;
    workspaceMemberId: string | null;
    workspaceRole: WorkspaceRole | null;
    userId: string | null;
    reportingManagerName: string | null;
    leadProjectIds: string[];
    managedProjectIds: string[];
    memberProjectIds?: string[];
    viewerProjectIds?: string[];
  };
  isError?: boolean;
}

export type WorkspaceType = WorkspaceData;
export type WorkspaceMembersType = WorkspaceMembersResult;
export type WorkspacesType = WorkspacesResult;
export type WorkspaceItemType = WorkspaceListItem;

export type { WorkspacePermissionsType, UserPermissionsType } from "@/data/user/get-user-permissions";
