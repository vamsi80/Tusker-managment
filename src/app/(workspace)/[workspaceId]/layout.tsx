
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"
import { getUserWorkspaces } from "../../data/workspace/get-user-workspace";
import { AppSidebar } from "../_components/sidebar/workspace-sidebar";
import { SiteHeader } from "../_components/sidebar/site-header";
import { getWorkspacesProjects } from "@/app/data/workspace/get-workspace-members";
import { redirect } from "next/navigation";

interface Props {
    children: React.ReactNode;
    // params: Promise<{ workspaceId: string }>;
}

export default async function WorkSpaceLayout({  children }: Props) {
    // const { workspaceId } = await params;
    const data = await getUserWorkspaces();
    // const { workspaceMembers, workspaceProjects } = await getWorkspacesProjects(workspaceId);

    return (
        <SidebarProvider
            style={
                {
                    "--sidebar-width": "calc(var(--spacing) * 72)",
                    "--header-height": "calc(var(--spacing) * 12)",
                } as React.CSSProperties
            }
        >
            <AppSidebar variant="inset" data={data as any} />
            <SidebarInset>
                <SiteHeader />
                <div className="flex flex-1 flex-col">
                    <div className="@container/main flex flex-1 flex-col gap-2">
                        <div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6 px-6 lg:px-8">
                            {children}
                        </div>
                    </div>
                </div>
            </SidebarInset>
        </SidebarProvider>
    )
}
