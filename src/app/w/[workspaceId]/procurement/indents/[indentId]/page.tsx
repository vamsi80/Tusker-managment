import { requireUser } from "@/lib/auth/require-user";
import db from "@/lib/db";
import { redirect, notFound } from "next/navigation";
import { IndentDetailClient } from "./_components/indent-detail-client";
import { serializeIndentForClient } from "@/lib/procurement/serialize-indent";
import { canCreatePurchaseOrder } from "@/lib/procurement/purchase-order";
import { getWorkspacePermissions } from "@/data/user/get-user-permissions";

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

  const indent = await db.indent.findUnique({
    where: { id: indentId },
    include: {
      project: { select: { id: true, name: true, projectManagerId: true } },
      requestedBy: {
        include: {
          user: { select: { name: true, surname: true, email: true } },
        },
      },
      finalApprovedBy: {
        include: {
          user: { select: { name: true, surname: true, email: true } },
        },
      },
      lineItems: true,
      purchaseOrders: { select: { id: true } },
      selectedVendor: { select: { id: true, name: true, companyName: true } },
    },
  });

  if (!indent || indent.workspaceId !== workspaceId) {
    notFound();
  }

  const permissions = await getWorkspacePermissions(workspaceId, user.id, true);

  return (
    <IndentDetailClient
      workspaceId={workspaceId}
      indent={serializeIndentForClient(indent)}
      canCreatePo={canCreatePurchaseOrder(user.email, permissions.workspaceRole)}
    />
  );
}
