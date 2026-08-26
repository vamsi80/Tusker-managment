import { requireUser } from "@/lib/auth/require-user";
import db from "@/lib/db";
import { redirect } from "next/navigation";
import { getWorkspacePermissions } from "@/data/user/get-user-permissions";
import { ProcurementTabs } from "./_components/procurement-tabs";

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

  const workspace = await db.workspace.findUnique({
    where: { id: workspaceId },
    select: { name: true },
  });

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
    <div className="flex-1 flex flex-col min-h-0 overflow-hidden h-full bg-background">
      {/* Shared Tabs Navigation */}
      <div className="shrink-0 mb-4">
        <ProcurementTabs workspaceId={workspaceId} workspaceName={workspace.name} />
      </div>

      {/* Page Content */}
      <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
        {children}
      </div>
    </div>
  );
}
