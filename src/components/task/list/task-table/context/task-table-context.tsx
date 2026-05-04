"use client";

import React, { createContext, useContext, useState } from "react";
import type { ProjectMembersType } from "@/types/project";
import type { UserPermissionsType } from "@/data/user/get-user-permissions";
import { ColumnVisibility } from "../../../shared/column-visibility";

interface TaskTableContextValue {
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
  projects: any[];
  projectMap: Record<string, any>;
  leadProjectIds: string[];
  scrollContainerRef: React.RefObject<HTMLDivElement | null>;
}

const TaskTableContext = createContext<TaskTableContextValue | null>(null);

export function TaskTableProvider({
  children,
  value,
}: {
  children: React.ReactNode;
  value: TaskTableContextValue;
}) {
  return (
    <TaskTableContext.Provider value={value}>
      {children}
    </TaskTableContext.Provider>
  );
}

export function useTaskTableContext() {
  const context = useContext(TaskTableContext);
  if (!context) {
    throw new Error("useTaskTableContext must be used within a TaskTableProvider");
  }
  return context;
}
