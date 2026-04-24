/**
 * Types for workspace data
 */
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
  workspaceRole: string;
  designation?: string | null;
  reportToId?: string | null;
  user?: {
    id: string;
    name?: string | null;
    surname?: string | null;
    email: string;
    emailVerified: boolean;
    image?: string | null;
    contactNumber?: string | null;
    phoneNumber?: string | null;
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

export type WorkspaceType = WorkspaceData;
export type WorkspaceMembersType = WorkspaceMembersResult;
export type WorkspacesType = WorkspacesResult;
export type WorkspaceItemType = WorkspaceListItem;
