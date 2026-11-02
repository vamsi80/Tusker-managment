// Desktop copy of apps/web/src/app/w/[workspaceId]/procurement/rfqs/create/page.tsx: identical except the inline prisma
// queries, which run on the API (apps/api .../routes/desktop.ts) unchanged.
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/require-user";
import { CreateRfqClient } from "@/app/w/[workspaceId]/procurement/rfqs/create/_components/create-rfq-client";
import { getWorkspacePermissions } from "@/data/user/get-user-permissions";
import { api } from "~/overrides/web/lib/desktop-api";

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

  const member = { workspaceRole: (await getWorkspacePermissions(workspaceId, user.id, true)).workspaceRole };
  if (member?.workspaceRole === "ACCOUNTS") {
    redirect(`/w/${workspaceId}/procurement/rfqs`);
  }

  // Approved indents with pending line items (already filtered and serialised), and active vendors
  const { indents: filteredIndents, vendors } = await api<{ indents: any[]; vendors: any[] }>("/desktop/procurement/rfq-create", { query: { workspaceId } });

  // Format indents to filter out any that have no pending line items left.
  // Serialize before handing to the client: taxPercent/exciseDutyPercent/vatPercent
  // are Prisma Decimals, which cannot cross the Server/Client boundary.

  return (
    <CreateRfqClient
      workspaceId={workspaceId}
      indents={filteredIndents}
      vendors={vendors}
    />
  );
}
