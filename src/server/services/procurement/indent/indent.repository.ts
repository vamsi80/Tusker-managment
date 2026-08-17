import prisma from "@/lib/db";

export class IndentRepository {
  static async findById(id: string) {
    return prisma.indent.findUnique({
      where: { id },
      include: {
        lineItems: {
          include: {
            approvedQuote: {
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
          },
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
    projectId: string;
    taskId?: string;
    name: string;
    description?: string;
    expectedDelivery?: Date;
    requestedById: string;
    approverIds?: string[];
    lineItems?: {
      materialName: string;
      unit: string;
      quantity: number;
      estimatedUnitPrice?: number;
      specifications?: string | null;
    }[];
  }) {
    return prisma.$transaction(async (tx) => {
      const indent = await tx.indent.create({
        data: {
          workspaceId: data.workspaceId,
          projectId: data.projectId,
          taskId: data.taskId || null,
          name: data.name,
          description: data.description,
          expectedDelivery: data.expectedDelivery,
          requestedById: data.requestedById,
          approverIds: data.approverIds || [],
          status: "DRAFT",
          lineItems: data.lineItems
            ? {
                create: data.lineItems.map((item) => ({
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

      if (data.lineItems && data.lineItems.length > 0) {
        for (const item of data.lineItems) {
          await IndentRepository.rememberMaterial(
            data.workspaceId,
            item.materialName,
            item.unit,
            tx
          );
        }
      }

      return indent;
    });
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
    tx?: any
  ) {
    const client = tx || prisma;
    const name = materialName.trim();
    const resolvedUnit = unit?.trim() || null;

    const existing = await client.materialCatalog.findFirst({
      where: {
        workspaceId,
        name: { equals: name, mode: "insensitive" },
      },
      select: { id: true },
    });

    if (existing) {
      return client.materialCatalog.update({
        where: { id: existing.id },
        data: resolvedUnit ? { unit: resolvedUnit } : {},
      });
    }

    return client.materialCatalog.create({
      data: {
        workspaceId,
        name,
        unit: resolvedUnit,
        source: "INDENT",
      },
    });
  }
}
