
import { ProjectListItem } from "./project";

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
  members?: WorkspaceMemberRow[];
};

export type SlimMember = {
  id: string;
  surname: string;
  email?: string;
  casualLeaveBalance?: number;
  sickLeaveBalance?: number;
};

export type WorkspaceMemberRow = {
  id: string;
  workspaceId: string;
  userId: string;
  workspaceRole: WorkspaceRole;
  designation?: string | null;
  reportToId?: string | null;
  employeeId?: string | null;
  dateOfBirth?: string | Date | null;
  name?: string;
  surname?: string;
  email?: string;
  phoneNumber?: string | null;
  reportToName?: string | null;
  status?: string;
  casualLeaveBalance?: number;
  sickLeaveBalance?: number;
};


export type WorkspaceListItem = {
  id: string;
  name: string;
  slug: string | null;
  ownerId: string;
  createdAt: Date;
  updatedAt: Date;
  workspaceRole: WorkspaceRole;
  memberCount?: number;
};

export type WorkspacesResult = {
  workspaces: WorkspaceListItem[];
  totalCount: number;
};

export type WorkspaceMembersResult = {
  workspaceMembers: WorkspaceMemberRow[];
  totalCount: number;
};

export interface WorkspaceLayoutData {
  workspaces: WorkspacesResult;
  metadata?: Record<string, unknown> | null;
  projects: ProjectListItem[];
  tags: Array<{ id: string; name: string; workspaceId: string; requirePurchase: boolean }>;
  projectManagers: Record<string, Array<{ id: string; surname: string | null }>>;
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
    coordinatorProjectIds?: string[];
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
