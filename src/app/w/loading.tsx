import { WorkspaceFullSkeleton } from "./_components/workspace-skeleton";

/**
 * Fallback shown during the initial navigation to the workspace route,
 * or while the WorkSpaceLayout is fetching initial metadata.
 */
export default function WorkspacesRootLoading() {
    return <WorkspaceFullSkeleton />;
}
