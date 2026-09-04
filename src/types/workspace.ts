
/**
 * Types for workspace data
 */
import type { CapabilityMap } from "@/lib/constants/capabilities";
export type WorkspaceRole = "ADMIN" | "OWNER" | "MANAGER" | "PROCUREMENT" | "ACCOUNTS" | "MEMBER" | "VIEWER";
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
  departmentId?: string | null;
  departmentName?: string | null;
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
  workspaceRole: any;
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

/** A workspace announcement, as stored in the notification table. */
export type BroadcastMessage = {
  id: string;
  /** Shared by every member's copy of the same broadcast; edit/delete address this. */
  entityId?: string | null;
  title: string;
  body: string;
  createdAt: string | Date;
  isRead?: boolean;
  metadata?: { senderName?: string; expiresAt?: string | null } | null;
};

export interface WorkspaceLayoutData {
  workspaces: WorkspacesResult;
  metadata?: any;
  projects: any[];
  tags: any[];
  projectManagers: Record<string, any[]>;
  unreadNotificationsCount: number;
  /** Sent with the layout payload so the dashboard box paints without a second fetch. */
  broadcasts?: BroadcastMessage[];
  permissions: {
    isWorkspaceAdmin: boolean;
    canCreateProject: boolean;
    workspaceMemberId: string | null;
    workspaceRole: WorkspaceRole | null;
    userId: string | null;
    reportingManagerName: string | null;
    capabilities: CapabilityMap;
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
