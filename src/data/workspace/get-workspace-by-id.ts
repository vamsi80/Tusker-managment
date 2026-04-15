import { cache } from "react";
import { notFound } from "next/navigation";
import { WorkspaceService } from "@/server/services/workspace.service";
import { requireUser } from "@/lib/auth/require-user";

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
  // ... all other fields ...
  members?: any[];
};

/**
 * Public function — returns workspace data for given workspaceId
 * Now calls WorkspaceService directly for server-side efficiency.
 */
export const getWorkspaceById = cache(
  async (workspaceId: string): Promise<WorkspaceData> => {
    if (!workspaceId) {
      throw new Error("workspaceId is required");
    }

    try {
      const user = await requireUser();
      const workspace = await WorkspaceService.getWorkspaceById(
        workspaceId,
        user.id,
      );

      if (!workspace) {
        return notFound();
      }
      return workspace as unknown as WorkspaceData;
    } catch (error) {
      console.error("Error fetching workspace by ID via Service:", error);
      return notFound();
    }
  },
);

/**
 * Export types for callers
 */
export type WorkspaceType = WorkspaceData;
