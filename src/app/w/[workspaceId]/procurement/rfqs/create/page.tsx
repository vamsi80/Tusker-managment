import db from "@/lib/db";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/require-user";
import { CreateRfqClient } from "./_components/create-rfq-client";

interface PageProps {
  params: Promise<{
    workspaceId: string;
  }>;
}

export default async function WorkspaceProcurementCreateRfq({ params }: PageProps) {
  const { workspaceId } = await params;
  const user = await requireUser();

  if (!user) {
    redirect("/login");
  }

  // Fetch approved indents with line items
  const indents = await db.indent.findMany({
    where: {
      workspaceId,
      status: "APPROVED",
    },
    include: {
      project: { select: { id: true, name: true } },
      lineItems: {
        where: {
          status: "PENDING", // only fetch pending items that haven't had RFQs sent yet
        },
      },
    },
    orderBy: { updatedAt: "desc" },
  });

  // Fetch active vendors
  const vendors = await db.vendor.findMany({
    where: {
      workspaceId,
      isActive: true,
    },
    orderBy: { name: "asc" },
  });

  // Format indents to filter out any that have no pending line items left
  const filteredIndents = indents.filter(ind => ind.lineItems.length > 0);

  return (
    <CreateRfqClient
      workspaceId={workspaceId}
      indents={filteredIndents}
      vendors={vendors}
    />
  );
}
