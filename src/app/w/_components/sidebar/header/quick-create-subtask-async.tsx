import { QuickCreateSubTask } from "./quick-create-subtask";
import { getWorkspaceTaskCreationData } from "@/data/workspace/get-workspace-task-creation-data";

interface Props {
  workspaceId: string;
}

export async function QuickCreateSubTaskAsync({ workspaceId }: Props) {
  let initialData = null;
  let error = false;

  try {
    initialData = await getWorkspaceTaskCreationData(workspaceId);
  } catch (e) {
    console.error("Failed to load workspace task creation data:", e);
    error = true;
  }

  return (
    <QuickCreateSubTask
      workspaceId={workspaceId}
      initialData={initialData}
      error={error}
    />
  );
}

export function QuickCreateSubTaskSkeleton() {
  return (
    <div className="h-9 w-full rounded-md bg-sidebar-accent/50 animate-pulse" />
  );
}
