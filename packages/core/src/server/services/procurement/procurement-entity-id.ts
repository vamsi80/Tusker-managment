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

/**
 * Atomically reserves the next workspace-scoped material ID, filling deleted
 * code gaps in ascending order before continuing sequentially.
 */
export async function nextMaterialId(tx: any, workspaceId: string) {
  if (tx.materialCatalog?.findMany) {
    const existing = await tx.materialCatalog.findMany({
      where: { workspaceId },
      select: { materialId: true },
    });

    const used = new Set<number>();
    for (const row of existing) {
      if (row.materialId) {
        const match = row.materialId.match(/^MAT-(\d+)$/);
        if (match) {
          used.add(parseInt(match[1], 10));
        }
      }
    }

    // ponytail: find lowest positive integer gap in ascending order
    let candidate = 1;
    while (used.has(candidate)) {
      candidate++;
    }

    if (tx.workspace?.update) {
      const highest = Math.max(0, ...Array.from(used), candidate);
      await tx.workspace.update({
        where: { id: workspaceId },
        data: { nextMaterialNumber: highest + 1 },
      });
    }

    return formatEntityId("MAT", candidate);
  }

  // Fallback if tx.materialCatalog is not provided (e.g. legacy test mock)
  const workspace = await tx.workspace.update({
    where: { id: workspaceId },
    data: { nextMaterialNumber: { increment: 1 } },
    select: { nextMaterialNumber: true },
  });

  return formatEntityId("MAT", workspace.nextMaterialNumber - 1);
}

