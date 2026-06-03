"use client";

import { useEffect, useState } from "react";
import { useWorkspaceLayout } from "@/app/w/[workspaceId]/_components/workspace-layout-context";

import { IndentHeader } from "./indent-header";
import { IndentWorkflowStepper } from "./indent-workflow-stepper";
import { LineItemTable } from "./line-item-table";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { CreateIndentForm } from "../../p/[slug]/procurement/create-indent/_components/create-indent-form";

interface ProcurementTabProps {
  taskId: string;
  projectId: string;
  workspaceId: string;
}

export function ProcurementTab({
  taskId,
  projectId,
  workspaceId,
}: ProcurementTabProps) {
  const { data: workspaceData } = useWorkspaceLayout();
  const [indent, setIndent] = useState<any | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const fetchIndent = async () => {
    try {
      setIsLoading(true);
      const res = await fetch(`/api/v1/procurement/indents/task/${taskId}?w=${workspaceId}`);
      if (res.ok) {
        const json = await res.json();
        setIndent(json.data || null);
      }
    } catch (err) {
      console.error("Failed to fetch indent details:", err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchIndent();
  }, [taskId, workspaceId]);

  const workspaceRole = workspaceData?.permissions?.workspaceRole;
  const isWorkspaceAdmin = workspaceRole === "ADMIN" || workspaceRole === "OWNER";

  if (isLoading) {
    return (
      <div className="p-6 space-y-4 flex-1 flex flex-col">
        <Skeleton className="h-20 w-full rounded-lg" />
        <Skeleton className="h-10 w-full rounded-lg" />
        <Skeleton className="h-32 w-full rounded-lg" />
      </div>
    );
  }

  return (
    <ScrollArea className="flex-1 min-h-0 h-full">
      <div className="p-5 space-y-5">
        {!indent ? (
          <CreateIndentForm
            taskId={taskId}
            projectId={projectId}
            workspaceId={workspaceId}
            onSuccess={(newIndent) => {
              setIndent(newIndent);
            }}
          />
        ) : (
          <div className="space-y-4">
            <IndentHeader
              indent={indent}
              workspaceId={workspaceId}
              workspaceRole={workspaceRole || undefined}
              isWorkspaceAdmin={isWorkspaceAdmin}
              onUpdate={(updated) => {
                setIndent(updated);
              }}
            />
            <IndentWorkflowStepper status={indent.status} />
            <LineItemTable
              indent={indent}
              workspaceId={workspaceId}
              workspaceRole={workspaceRole || undefined}
              isWorkspaceAdmin={isWorkspaceAdmin}
              onUpdate={(updated) => {
                setIndent(updated);
              }}
            />
          </div>
        )}
      </div>
    </ScrollArea>
  );
}
