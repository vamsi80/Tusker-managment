import { TaskPageWrapper } from "../_components/shared/task-page-wrapper";

interface Props {
    children: React.ReactNode;
    params: Promise<{ workspaceId: string }>;
}

/**
 * Workspace Tasks Layout
 *
 * Provides TaskPageWrapper context for task events (add/update/remove).
 * Access control is handled by the parent [workspaceId]/layout.tsx —
 * no need to fetch getWorkspaceMetadata again here.
 */
export default async function WorkspaceTasksLayout({ children, params }: Props) {
    console.log("🟢 RSC: tasks/layout.tsx render");
    return (
        <TaskPageWrapper>
            {children}
        </TaskPageWrapper>
    );
}
