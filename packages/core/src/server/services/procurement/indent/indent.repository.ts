import prisma from "@tusker/db";
import { ensureMaterialCatalog } from "../material-catalog.service";

export class IndentRepository {
  static async findById(id: string) {
    return prisma.indent.findUnique({
      where: { id },
      include: {
        lineItems: {
          include: {
            material: true,
            approvedQuote: {
              include: {
                vendor: true,
              },
            },
            // Every submitted quote, not just the approved one — needed for
            // the quote-comparison view. This was missing entirely, so that
            // view had no data to render regardless of the client's field names.
            vendorQuotes: {
              include: {
                vendor: true,
              },
            },
          },
        },
        requestedBy: {
          select: {
            id: true,
            reportToId: true,
            workspaceRole: true,
            user: {
              select: {
                id: true,
                name: true,
                surname: true,
              },
            },
          },
        },
        assignedTo: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                surname: true,
              },
            },
          },
        },
        project: {
          select: {
            id: true,
            name: true,
            projectManagerId: true,
          },
        },
        selectedVendor: {
          select: { id: true, vendorId: true, name: true, companyName: true },
        },
        task: {
          select: {
            id: true,
            name: true,
            taskSlug: true,
          },
        },
      },
    });
  }

  static async findByTaskId(taskId: string) {
    return prisma.indent.findUnique({
      where: { taskId },
      include: {
        lineItems: true,
      },
    });
  }

  static async findMany(workspaceId: string, filter: { projectId?: string; status?: string; page?: number }) {
    const take = 20;
    const skip = ((filter.page || 1) - 1) * take;
    return prisma.indent.findMany({
      where: {
        workspaceId,
        ...(filter.projectId && { projectId: filter.projectId }),
        ...(filter.status && { status: filter.status as any }),
      },
      orderBy: { createdAt: "desc" },
      take,
      skip,
      include: {
        requestedBy: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                surname: true,
              },
            },
          },
        },
        _count: {
          select: {
            lineItems: true,
          },
        },
      },
    });
  }

  static async create(data: {
    workspaceId: string;
    projectId?: string | null;
    taskId?: string;
    name: string;
    description?: string;
    expectedDelivery?: Date;
    taxPercent?: number;
    exciseDutyPercent?: number;
    vatPercent?: number;
    transportCharge?: number;
    labourCharge?: number;
    raisedInProject?: boolean;
    requestedById: string;
    approverIds?: string[];
    lineItems?: {
      materialCatalogId?: string;
      materialName: string;
      unit: string;
      quantity: number;
      estimatedUnitPrice?: number;
      specifications?: string | null;
    }[];
  }) {
    for (let attempt = 0; ; attempt++) {
      try {
        return await prisma.$transaction(async (tx) => {
          const catalogMaterials: { id: string }[] = [];
          if (data.lineItems) {
            for (const item of data.lineItems) {
              catalogMaterials.push(
                await IndentRepository.rememberMaterial(
                  data.workspaceId,
                  item.materialName,
                  item.unit,
                  tx,
                  item.materialCatalogId
                )
              );
            }
          }

          const indent = await tx.indent.create({
            data: {
              indentId: await IndentRepository.nextIndentNumber(tx),
              workspaceId: data.workspaceId,
              projectId: data.projectId ?? null,
              taskId: data.taskId || null,
              name: data.name,
              description: data.description,
              expectedDelivery: data.expectedDelivery,
              taxPercent: data.taxPercent,
              exciseDutyPercent: data.exciseDutyPercent,
              vatPercent: data.vatPercent,
              transportCharge: data.transportCharge,
              labourCharge: data.labourCharge,
              requestedById: data.requestedById,
              raisedInProject: data.raisedInProject ?? false,
              approverIds: data.approverIds || [],
              status: "DRAFT",
              lineItems: data.lineItems
                ? {
                    create: data.lineItems.map((item, index) => ({
                      materialCatalogId: catalogMaterials[index].id,
                      materialName: item.materialName,
                      unit: item.unit,
                      quantity: item.quantity,
                      estimatedUnitPrice: item.estimatedUnitPrice,
                      specifications: item.specifications,
                      status: "PENDING",
                    })),
                  }
                : undefined,
            },
            include: {
              lineItems: true,
            },
          });

          return indent;
        });
      } catch (err: any) {
        // A concurrent create grabbed the same indent number - pick the next one.
        if (err?.code === "P2002" && String(err?.meta?.target).includes("indentId") && attempt < 3) continue;
        throw err;
      }
    }
  }

  /**
   * Human-readable indent number: 2 digit year + 4 digit sequence (260001).
   * ponytail: max+1 guarded by the unique index on indentId; swap for a DB
   * sequence if indents ever get created concurrently enough to retry often.
   */
  private static async nextIndentNumber(tx: any) {
    const last = await tx.indent.findFirst({
      where: { indentId: { startsWith: "IND-" } },
      orderBy: { indentId: "desc" },
      select: { indentId: true },
    });
    const next = last?.indentId ? Number(last.indentId.replace("IND-", "")) + 1 : 1;
    return `IND-${String(next).padStart(4, "0")}`;
  }

  static async updateStatus(id: string, status: any, extra?: any, tx?: any) {
    const client = tx || prisma;
    return client.indent.update({
      where: { id },
      data: { status, ...extra },
    });
  }

  static async findWorkspaceMember(userId: string, workspaceId: string) {
    return prisma.workspaceMember.findFirst({
      where: { userId, workspaceId },
      select: { id: true, workspaceRole: true },
    });
  }

  static async rememberMaterial(
    workspaceId: string,
    materialName: string,
    unit?: string,
    tx?: any,
    materialCatalogId?: string
  ) {
    const client = tx || prisma;
    return ensureMaterialCatalog(client, {
      workspaceId,
      name: materialName,
      unit,
      source: "INDENT",
      catalogId: materialCatalogId,
    });
  }
}
