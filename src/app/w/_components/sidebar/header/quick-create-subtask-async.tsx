import { Suspense } from "react";
import { getWorkspaceTaskCreationData } from "@/data/workspace/get-workspace-task-creation-data";
import { QuickCreateSubTask } from "./quick-create-subtask";

interface Props {
    workspaceId: string;
}

export async function QuickCreateSubTaskAsync({ workspaceId }: Props) {
    // Fetch data specifically for this button
    const quickCreateData = await getWorkspaceTaskCreationData(workspaceId);

    return (
        <QuickCreateSubTask workspaceId={workspaceId} data={quickCreateData} />
    );
}

export function QuickCreateSubTaskSkeleton() {
    return (
        <div className="h-9 w-full rounded-md bg-sidebar-accent/50 animate-pulse" />
    );
}
