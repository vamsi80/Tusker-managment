
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"
import { AppSidebar } from "../_components/sidebar/workspace-sidebar";
import { SiteHeader } from "../_components/sidebar/site-header";
import { getUserWorkspaces } from "@/data/user/get-user-workspace";
import { requireUser } from "@/lib/auth/require-user";

interface Props {
    children: React.ReactNode;
    params: { workspaceId: string };
}

export default async function WorkSpaceLayout({ children, params }: Props) {
    const { workspaceId } = await params;
    const session = await requireUser();
    const data = await getUserWorkspaces(session.id);

    return (
        <SidebarProvider
            style={
                {
                    "--sidebar-width": "calc(var(--spacing) * 72)",
                    "--header-height": "calc(var(--spacing) * 12)",
                } as React.CSSProperties
            }
        >
            <AppSidebar variant="inset" data={data as any} workspaceId={workspaceId} />
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
