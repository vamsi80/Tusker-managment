const formatEntityId = (prefix: "VEN" | "MAT", value: number) =>
  `${prefix}-${String(value).padStart(4, "0")}`;

/**
 * Atomically reserves the next workspace-scoped vendor ID.
 * The workspace row update prevents two concurrent creates from receiving the
 * same human-readable ID.
 */
export async function nextVendorId(tx: any, workspaceId: string) {
  const workspace = await tx.workspace.update({
    where: { id: workspaceId },
    data: { nextVendorNumber: { increment: 1 } },
    select: { nextVendorNumber: true },
  });

  return formatEntityId("VEN", workspace.nextVendorNumber - 1);
}

/** Atomically reserves the next workspace-scoped material ID. */
export async function nextMaterialId(tx: any, workspaceId: string) {
  const workspace = await tx.workspace.update({
    where: { id: workspaceId },
    data: { nextMaterialNumber: { increment: 1 } },
    select: { nextMaterialNumber: true },
  });

  return formatEntityId("MAT", workspace.nextMaterialNumber - 1);
}

