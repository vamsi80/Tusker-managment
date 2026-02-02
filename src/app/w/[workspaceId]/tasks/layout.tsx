import { TaskPageWrapper } from "../_components/shared/task-page-wrapper";
import { getWorkspaceMetadata } from "@/data/workspace/get-workspace-metadata";

interface Props {
    children: React.ReactNode;
    params: Promise<{ workspaceId: string }>;
}

/**
 * Workspace Tasks Layout
 * 
 * IMPORTANT: This layout ONLY provides structure.
 * It does NOT fetch business data (tasks, projects, members, etc.)
 * 
 * Data fetching happens in:
 * - page.tsx for initial page data
 * - Individual view components for their specific data
 * - Server Actions for mutations and lazy loading
 */
export default async function WorkspaceTasksLayout({ children, params }: Props) {
    console.log("🟢 RSC: tasks/layout.tsx render");
    const { workspaceId } = await params;

    // Only fetch minimal metadata for access control
    const workspace = await getWorkspaceMetadata(workspaceId);

    if (!workspace) {
        return (
            <div className="p-6">
                <h1 className="text-2xl font-semibold">Access Denied</h1>
                <p className="text-muted-foreground">
                    You don't have permission to access this workspace or it doesn't exist.
                </p>
            </div>
        );
    }

    return (
        <TaskPageWrapper>
            {children}
        </TaskPageWrapper>
    );
}
