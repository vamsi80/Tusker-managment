import { Suspense } from "react";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "../_components/sidebar/workspace-sidebar";
import { SiteHeader } from "../_components/sidebar/header/site-header";
import { WorkspaceSidebarSkeleton } from "../_components/workspace-skeleton";
import { getWorkspaces } from "@/data/workspace/get-workspaces";
import { getWorkspaceMetadata } from "@/data/workspace/get-workspace-metadata";
import { notFound } from "next/navigation";
import { DailyReportFAB } from "./reports/_components/DailyReportFAB";
import { getDailyReportStatus } from "@/actions/daily-report-actions";
import { requireUser } from "@/lib/auth/require-user";

interface Props {
    children: React.ReactNode;
    params: Promise<{ workspaceId: string }>;
}

/**
 * Loads sidebar data independently so the shell renders immediately
 * while the sidebar data streams in.
 */
async function SidebarLoader({ workspaceId, userId }: { workspaceId: string, userId: string }) {
    const data = await getWorkspaces(userId);
    return <AppSidebar data={data as any} workspaceId={workspaceId} />;
}

async function DailyReportFABLoader({ workspaceId }: { workspaceId: string }) {
    let initialStatus: "SUBMITTED" | "ABSENT" | "NOT_SUBMITTED" | "LOADING" = "NOT_SUBMITTED";
    try {
        const data = await getDailyReportStatus(workspaceId);
        initialStatus = (data.status as "SUBMITTED" | "ABSENT" | "NOT_SUBMITTED") || "NOT_SUBMITTED";
    } catch (error) {
        // Fallback to NOT_SUBMITTED on error
    }

    return <DailyReportFAB workspaceId={workspaceId} initialStatus={initialStatus} />;
}

export default async function WorkSpaceLayout({ children, params }: Props) {
    const { workspaceId } = await params;

    // 🚀 Performance: Call requireUser once and propagate for cache bypasses (~2-3s savings total)
    const user = await requireUser();

    // Lightweight access check — only done here, not repeated in child layouts
    const workspace = await getWorkspaceMetadata(workspaceId, user.id);
    if (!workspace) {
        return notFound();
    }

    return (
        <SidebarProvider
            style={
                {
                    "--sidebar-width": "calc(var(--spacing) * 72)",
                    "--header-height": "calc(var(--spacing) * 12)",
                } as React.CSSProperties
            }
        >
            {/* Sidebar streams in — shell renders instantly */}
            <Suspense fallback={<WorkspaceSidebarSkeleton />}>
                <SidebarLoader workspaceId={workspaceId} userId={user.id} />
            </Suspense>

            <SidebarInset className="m-0 rounded-none bg-background">
                <SiteHeader workspaceId={workspaceId} />
                <div className="flex flex-1 flex-col">
                    <div className="@container/main flex flex-1 flex-col gap-2">
                        <div className="flex flex-col gap-4 py-2 px-4 sm:px-6 lg:px-8">
                            {children}
                        </div>
                    </div>
                </div>
            </SidebarInset>
            <Suspense fallback={null}>
                <DailyReportFABLoader workspaceId={workspaceId} />
            </Suspense>
        </SidebarProvider>
    );
}
