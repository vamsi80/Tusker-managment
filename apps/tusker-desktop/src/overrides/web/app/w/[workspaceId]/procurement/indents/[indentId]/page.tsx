// Desktop copy of apps/web/src/app/w/[workspaceId]/procurement/indents/[indentId]/page.tsx: identical except the inline prisma
// queries, which run on the API (apps/api .../routes/desktop.ts) unchanged.
import { requireUser } from "@/lib/auth/require-user";
import { redirect, notFound } from "next/navigation";
import { IndentDetailClient } from "@/app/w/[workspaceId]/procurement/indents/[indentId]/_components/indent-detail-client";
import { canCreatePurchaseOrder } from "@tusker/core/lib/procurement/purchase-order";
import { getWorkspacePermissions } from "@/data/user/get-user-permissions";
import { api } from "~/overrides/web/lib/desktop-api";

interface PageProps {
  params: Promise<{
    workspaceId: string;
    indentId: string;
  }>;
}

export default async function IndentDetailPage({ params }: PageProps) {
  const { workspaceId, indentId } = await params;
  const user = await requireUser();

  if (!user) {
    redirect("/login");
  }

  // The indent (serialised), its approvers and manager, resolved on the API exactly as here.
  const data = await api<{ indent: any; approvers: any[]; managerMemberId: string | null } | null>(
    `/desktop/procurement/indents/${indentId}`,
    { query: { workspaceId } },
  );

  if (!data) {
    notFound();
  }

  const permissions = await getWorkspacePermissions(workspaceId, user.id, true);

  const { indent, approvers, managerMemberId } = data;

  return (
    <IndentDetailClient
      workspaceId={workspaceId}
      indent={indent}
      approvers={approvers}
      managerMemberId={managerMemberId ?? null}
      canCreatePo={canCreatePurchaseOrder(user.email, permissions.workspaceRole)}
    />
  );
}
