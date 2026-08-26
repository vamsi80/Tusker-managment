import Link from "next/link";
import { requireUser } from "@/lib/auth/require-user";
import prisma from "@/lib/db";
import { Button } from "@/components/ui/button";
import {
  BUYER_COMPANIES,
  canCreatePurchaseOrder,
  formatPaise,
} from "@/lib/procurement/purchase-order";
import { getWorkspacePermissions } from "@/data/user/get-user-permissions";

interface PageProps {
  params: Promise<{ workspaceId: string }>;
}

export default async function PurchaseOrdersPage({ params }: PageProps) {
  const { workspaceId } = await params;
  const user = await requireUser();

  const permissions = await getWorkspacePermissions(workspaceId, user.id, true);

  const purchaseOrders = await prisma.purchaseOrder.findMany({
    where: { workspaceId },
    include: { vendor: { select: { name: true, companyName: true } } },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div className="flex flex-col gap-4 overflow-y-auto p-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">Purchase Orders</h1>
        {canCreatePurchaseOrder(user.email, permissions.workspaceRole) && (
          <Button asChild size="sm">
            <Link href={`/w/${workspaceId}/procurement/pos/new`}>New PO</Link>
          </Button>
        )}
      </div>

      {purchaseOrders.length === 0 ? (
        <p className="text-sm text-muted-foreground">No purchase orders yet.</p>
      ) : (
        <table className="w-full text-sm">
          <thead className="text-xs text-muted-foreground">
            <tr className="border-b [&>th]:px-2 [&>th]:py-2 [&>th]:text-left">
              <th>PO No</th>
              <th>Date</th>
              <th>Entity</th>
              <th>Vendor</th>
              <th className="text-right">Grand total</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {purchaseOrders.map((po) => (
              <tr key={po.id} className="border-b hover:bg-muted/40 [&>td]:px-2 [&>td]:py-2">
                <td>
                  <Link
                    href={`/w/${workspaceId}/procurement/pos/${po.id}`}
                    className="font-medium text-primary hover:underline"
                  >
                    {po.poNumber}
                  </Link>
                </td>
                <td>{po.poDate.toLocaleDateString("en-GB")}</td>
                <td>{BUYER_COMPANIES[po.company].name}</td>
                <td>{po.vendor.companyName || po.vendor.name}</td>
                <td className="text-right tabular-nums">{formatPaise(po.grandTotal)}</td>
                <td>{po.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
