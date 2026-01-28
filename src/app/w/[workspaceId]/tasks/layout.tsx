import { Suspense } from "react";
import { getTaskPageData } from "@/data/task";
import { TaskPageWrapper } from "../_components/shared/task-page-wrapper";
import { TaskPageProvider } from "../_components/shared/task-page-context";

interface Props {
    children: React.ReactNode;
    params: Promise<{ workspaceId: string }>;
}

export default async function WorkspaceTasksLayout({ children, params }: Props) {
    const { workspaceId } = await params;

    // Fetch workspace data ONCE at layout level
    const pageData = await getTaskPageData(workspaceId);

    if (!pageData) {
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
        <TaskPageProvider pageData={pageData}>
            <TaskPageWrapper>
                {children}
            </TaskPageWrapper>
        </TaskPageProvider>
    );
}
