import { requireUser } from "@/lib/auth/require-user";
import db from "@/lib/db";
import { redirect, notFound } from "next/navigation";
import { IndentDetailClient } from "./_components/indent-detail-client";

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
      project: { select: { id: true, name: true } },
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
    },
  });

  if (!indent || indent.workspaceId !== workspaceId) {
    notFound();
  }

  return (
    <IndentDetailClient workspaceId={workspaceId} indent={indent} />
  );
}
