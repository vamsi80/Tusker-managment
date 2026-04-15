"use client";

import { useEffect } from "react";

/**
 * UTILITY: Data Load Reporter
 * Prints the approximate payload size of its props to the browser console.
 * Used to verify the "Zero-Weight" architecture optimizations.
 */
import { useWorkspaceLayout } from "@/app/w/[workspaceId]/_components/workspace-layout-context";

export function DataLoadReporter() {
  const { data } = useWorkspaceLayout();
  const label = "Workspace Layout";
  useEffect(() => {
    if (!data) return;
    
    try {
      const json = JSON.stringify(data);
      const sizeInBytes = json.length;
      const sizeInKB = (sizeInBytes / 1024).toFixed(2);
      
      console.log(`%c[Zero-Weight] ${label} Payload: ${sizeInKB} KB`, "color: #10b981; font-weight: bold;");
    } catch (err) {
      console.warn(`[Zero-Weight] Failed to measure ${label} payload size:`, err);
    }
  }, [data, label]);

  return null;
}
