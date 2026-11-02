// Desktop copy of apps/web/src/app/w/[workspaceId]/procurement/layout.tsx: identical except the inline prisma
// queries, which run on the API (apps/api .../routes/desktop.ts) unchanged.
import { requireUser } from "@/lib/auth/require-user";
import { redirect } from "next/navigation";
import { getWorkspacePermissions } from "@/data/user/get-user-permissions";
import { ProcurementTabs } from "@/app/w/[workspaceId]/procurement/_components/procurement-tabs";
import { api } from "~/overrides/web/lib/desktop-api";

interface LayoutProps {
  children: React.ReactNode;
  params: Promise<{
    workspaceId: string;
  }>;
}

export default async function ProcurementLayout({ children, params }: LayoutProps) {
  const { workspaceId } = await params;
  const user = await requireUser();

  if (!user) {
    redirect("/login");
  }

  const workspace = await api<{ name: string } | null>("/desktop/workspace-name", { query: { workspaceId } });

  if (!workspace) {
    redirect("/dashboard");
  }

  // Settings -> Permissions can revoke Procurement per role or per member.
  // Guarding the layout covers every page nested under /procurement in one place.
  const permissions = await getWorkspacePermissions(workspaceId, user.id, true);
  if (!permissions.capabilities?.["procurement:view"]) {
    redirect(`/w/${workspaceId}`);
  }

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-hidden h-full">
      {/* Shared Tabs Navigation */}
      <div className="shrink-0 mb-5">
        <ProcurementTabs workspaceId={workspaceId} workspaceName={workspace.name} capabilities={permissions.capabilities} />
      </div>

      {/* Page Content */}
      <div className="flex-1 min-h-0 overflow-hidden flex flex-col surface p-4 sm:p-5">
        {children}
      </div>
    </div>
  );
}
