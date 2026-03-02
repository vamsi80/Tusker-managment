import { Suspense } from "react";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "../_components/sidebar/workspace-sidebar";
import { SiteHeader } from "../_components/sidebar/header/site-header";
import { getWorkspaces } from "@/data/workspace/get-workspaces";
import { getWorkspaceMetadata } from "@/data/workspace/get-workspace-metadata";
import { notFound } from "next/navigation";

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
                <SiteHeader />
                <div className="flex flex-1 flex-col">
                    <div className="@container/main flex flex-1 flex-col gap-2">
                        <div className="flex flex-col gap-4 py-2 md:gap-6 md:py-2 px-4 sm:px-6 lg:px-8">
                            {children}
                        </div>
                    </div>
                </div>
            </SidebarInset>
        </SidebarProvider>
    );
}
