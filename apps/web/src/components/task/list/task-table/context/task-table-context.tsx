"use client";

import React, { useContext } from "react";

import { TaskTableContext, type TaskTableContextValue } from "./task-table-context-object";

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
