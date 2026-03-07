import { WorkspaceTasksSkeleton } from "@/components/shared/workspace-skeletons";

/** Shown INSTANTLY by Next.js when navigating to /tasks */
export default function TasksLoading() {
    return <WorkspaceTasksSkeleton />;
}
