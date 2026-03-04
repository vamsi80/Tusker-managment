import { Suspense } from "react";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "../_components/sidebar/workspace-sidebar";
import { SiteHeader } from "../_components/sidebar/header/site-header";
import { getWorkspaces } from "@/data/workspace/get-workspaces";
import { getWorkspaceMetadata } from "@/data/workspace/get-workspace-metadata";
import { notFound } from "next/navigation";
import { DailyReportFAB } from "./reports/_components/DailyReportFAB";
import { getDailyReportFormData } from "@/actions/daily-report-actions";

interface Props {
    children: React.ReactNode;
    params: Promise<{ workspaceId: string }>;
}

/**
 * Loads sidebar data independently so the shell renders immediately
 * while the sidebar data streams in.
 */
async function SidebarLoader({ workspaceId }: { workspaceId: string }) {
    const data = await getWorkspaces();
    return <AppSidebar data={data as any} workspaceId={workspaceId} />;
}

async function DailyReportFABLoader({ workspaceId }: { workspaceId: string }) {
    let initialStatus: "SUBMITTED" | "ABSENT" | "NOT_SUBMITTED" | "LOADING" = "NOT_SUBMITTED";
    try {
        const data = await getDailyReportFormData(workspaceId);
        initialStatus = data.report?.status || "NOT_SUBMITTED";
    } catch (error) {
        // Fallback to NOT_SUBMITTED on error
    }

    return <DailyReportFAB workspaceId={workspaceId} initialStatus={initialStatus} />;
}

export default async function WorkSpaceLayout({ children, params }: Props) {
    const { workspaceId } = await params;

    // Lightweight access check — only done here, not repeated in child layouts
    const workspace = await getWorkspaceMetadata(workspaceId);
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
            <Suspense fallback={null}>
                <SidebarLoader workspaceId={workspaceId} />
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
