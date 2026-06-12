import React, { createContext } from "react";
import type { ProjectMembersType } from "@/types/project";
import type { UserPermissionsType } from "@/types/workspace";
import { ColumnVisibility } from "../../../shared/column-visibility";
import type { ProjectOption } from "../../../shared/types";

export interface TaskTableContextValue {
  workspaceId: string;
  projectId: string;
  members: ProjectMembersType;
  permissions?: UserPermissionsType;
  columnVisibility: ColumnVisibility;
  setColumnVisibility: React.Dispatch<React.SetStateAction<ColumnVisibility>>;
  level: "workspace" | "project";
  isWorkspaceAdmin: boolean;
  userId?: string;
  canCreateSubTask: boolean;
  tags: { id: string; name: string }[];
  projects: ProjectOption[];
  projectMap: Record<string, ProjectOption>;
  leadProjectIds: string[];
  coordinatorProjectIds: string[];
  scrollContainerRef: React.RefObject<HTMLDivElement | null>;
}

export const TaskTableContext = createContext<TaskTableContextValue | null>(null);
