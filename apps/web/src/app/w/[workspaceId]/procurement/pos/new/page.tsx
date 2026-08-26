import { Suspense } from "react";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/require-user";
import { canCreatePurchaseOrder } from "@/lib/procurement/purchase-order";
import { getWorkspacePermissions } from "@/data/user/get-user-permissions";
import { CreatePurchaseOrderForm } from "./_form";

interface PageProps {
  params: Promise<{ workspaceId: string }>;
}

export default async function NewPurchaseOrderPage({ params }: PageProps) {
  const { workspaceId } = await params;
  const user = await requireUser();

  const permissions = await getWorkspacePermissions(workspaceId, user.id, true);

  // The API enforces this too; this only keeps the page out of the way.
  if (!canCreatePurchaseOrder(user.email, permissions.workspaceRole)) {
    redirect(`/w/${workspaceId}/procurement/pos`);
  }

  return (
    <Suspense>
      <CreatePurchaseOrderForm />
    </Suspense>
  );
}
