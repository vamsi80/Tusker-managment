import { getDb } from "@/lib/registry";
import { AppError } from "@/lib/errors/app-error";
import { IndentRepository } from "./indent.repository";
import { INDENT_TRANSITIONS, assertTransition } from "../utils/state-machine";

export class IndentService {
  static async createIndent(
    data: {
      taskId?: string;
      projectId: string;
      workspaceId: string;
      name: string;
      description?: string;
      expectedDelivery?: Date;
      lineItems?: {
        materialName: string;
        unit: string;
        quantity: number;
        estimatedUnitPrice?: number;
        specifications?: string | null;
      }[];
    },
    userId: string
  ) {
    if (data.taskId) {
      const existing = await IndentRepository.findByTaskId(data.taskId);
      if (existing) throw AppError.Conflict("An indent already exists for this task");
    }

    const member = await IndentRepository.findWorkspaceMember(userId, data.workspaceId);
    if (!member) throw AppError.Forbidden("Not a workspace member");

    // Create indent and return
    const indent = await IndentRepository.create({
      ...data,
      requestedById: member.id,
    });

    return indent;
  }

  static async submitIndent(indentId: string, userId: string, workspaceId: string) {
    const indent = await IndentRepository.findById(indentId);
    if (!indent) throw AppError.NotFound("Indent not found");
    assertTransition(INDENT_TRANSITIONS, indent.status, "SUBMITTED", "Indent");

    const updated = await IndentRepository.updateStatus(indentId, "SUBMITTED", { submittedAt: new Date() });
    return updated;
  }

  static async assignIndent(indentId: string, assigneeId: string, userId: string, workspaceId: string) {
    const member = await IndentRepository.findWorkspaceMember(userId, workspaceId);
    if (!member) throw AppError.Forbidden("Not a workspace member");

    const allowedRoles = ["OWNER", "ADMIN", "MANAGER", "PROCUREMENT"];
    if (!allowedRoles.includes(member.workspaceRole)) {
      throw AppError.Forbidden("Insufficient permissions to assign indents");
    }

    const indent = await IndentRepository.findById(indentId);
    if (!indent) throw AppError.NotFound("Indent not found");
    assertTransition(INDENT_TRANSITIONS, indent.status, "ASSIGNED", "Indent");

    const assignee = await getDb().workspaceMember.findFirst({
      where: { id: assigneeId, workspaceId },
    });
    if (!assignee) throw AppError.NotFound("Assignee not found in workspace");

    return IndentRepository.updateStatus(indentId, "ASSIGNED", {
      assignedToId: assigneeId,
    });
  }

  static async approveIndent(indentId: string, userId: string, workspaceId: string) {
    const member = await IndentRepository.findWorkspaceMember(userId, workspaceId);
    if (!member) throw AppError.Forbidden("Not a workspace member");

    const allowedRoles = ["OWNER", "ADMIN", "MANAGER"];
    if (!allowedRoles.includes(member.workspaceRole)) {
      throw AppError.Forbidden("Insufficient permissions to approve indents");
    }

    const indent = await IndentRepository.findById(indentId);
    if (!indent) throw AppError.NotFound("Indent not found");
    assertTransition(INDENT_TRANSITIONS, indent.status, "APPROVED", "Indent");

    return IndentRepository.updateStatus(indentId, "APPROVED", {
      finalApprovedAt: new Date(),
      finalApprovedById: member.id,
    });
  }

  static async cancelIndent(indentId: string, reason: string, userId: string, workspaceId: string) {
    const indent = await IndentRepository.findById(indentId);
    if (!indent) throw AppError.NotFound("Indent not found");

    const hasPOCreated = indent.lineItems.some((li: any) => li.status === "PO_CREATED");
    if (hasPOCreated) throw AppError.Conflict("Cannot cancel: some line items are already PO generated");

    assertTransition(INDENT_TRANSITIONS, indent.status, "CANCELLED", "Indent");

    await getDb().$transaction(async (tx) => {
      await tx.indentLineItem.updateMany({
        where: { indentId, status: { in: ["PENDING", "RFQ_SENT", "QUOTES_RECEIVED"] } },
        data: { status: "REJECTED" },
      });
      await tx.indent.update({
        where: { id: indentId },
        data: { status: "CANCELLED", cancelledAt: new Date(), cancelReason: reason },
      });
    });
  }

  static async addLineItem(
    indentId: string,
    data: {
      materialName: string;
      unit: string;
      quantity: number;
      estimatedUnitPrice?: number;
      specifications?: string | null;
    },
    userId: string,
    workspaceId: string
  ) {
    const indent = await IndentRepository.findById(indentId);
    if (!indent) throw AppError.NotFound("Indent not found");

    const allowedStatuses = ["DRAFT", "SUBMITTED", "ASSIGNED"];
    if (!allowedStatuses.includes(indent.status)) {
      throw AppError.Conflict(`Cannot add items for an indent that is already ${indent.status}`);
    }

    const member = await IndentRepository.findWorkspaceMember(userId, workspaceId);
    if (!member) throw AppError.Forbidden("Not a workspace member");

    if (indent.status !== "DRAFT") {
      const allowedRoles = ["OWNER", "ADMIN", "MANAGER"];
      if (!allowedRoles.includes(member.workspaceRole)) {
        throw AppError.Forbidden("Only owners, admins, and managers can add items after submission");
      }
    }

    return getDb().indentLineItem.create({
      data: {
        indentId,
        materialName: data.materialName,
        unit: data.unit,
        quantity: data.quantity,
        estimatedUnitPrice: data.estimatedUnitPrice,
        specifications: data.specifications,
        status: "PENDING",
      },
    });
  }

  static async removeLineItem(indentId: string, itemId: string, userId: string, workspaceId: string) {
    const indent = await IndentRepository.findById(indentId);
    if (!indent) throw AppError.NotFound("Indent not found");

    const allowedStatuses = ["DRAFT", "SUBMITTED", "ASSIGNED"];
    if (!allowedStatuses.includes(indent.status)) {
      throw AppError.Conflict(`Cannot remove items from an indent that is already ${indent.status}`);
    }

    const member = await IndentRepository.findWorkspaceMember(userId, workspaceId);
    if (!member) throw AppError.Forbidden("Not a workspace member");

    if (indent.status !== "DRAFT") {
      const allowedRoles = ["OWNER", "ADMIN", "MANAGER"];
      if (!allowedRoles.includes(member.workspaceRole)) {
        throw AppError.Forbidden("Only owners, admins, and managers can remove items after submission");
      }
    }

    const item = await getDb().indentLineItem.findUnique({
      where: { id: itemId },
    });
    if (!item || item.indentId !== indentId) {
      throw AppError.NotFound("Line item not found in this indent");
    }

    return getDb().indentLineItem.delete({
      where: { id: itemId },
    });
  }

  static async updateLineItem(
    indentId: string,
    itemId: string,
    data: {
      materialName?: string;
      unit?: string;
      quantity?: number;
      estimatedUnitPrice?: number;
      specifications?: string | null;
    },
    userId: string,
    workspaceId: string
  ) {
    const indent = await IndentRepository.findById(indentId);
    if (!indent) throw AppError.NotFound("Indent not found");

    const allowedStatuses = ["DRAFT", "SUBMITTED", "ASSIGNED"];
    if (!allowedStatuses.includes(indent.status)) {
      throw AppError.Conflict(`Cannot update items of an indent that is already ${indent.status}`);
    }

    const member = await IndentRepository.findWorkspaceMember(userId, workspaceId);
    if (!member) throw AppError.Forbidden("Not a workspace member");

    if (indent.status !== "DRAFT") {
      const allowedRoles = ["OWNER", "ADMIN", "MANAGER"];
      if (!allowedRoles.includes(member.workspaceRole)) {
        throw AppError.Forbidden("Only owners, admins, and managers can update items after submission");
      }
    }

    const item = await getDb().indentLineItem.findUnique({
      where: { id: itemId },
    });
    if (!item || item.indentId !== indentId) {
      throw AppError.NotFound("Line item not found in this indent");
    }

    return getDb().indentLineItem.update({
      where: { id: itemId },
      data: {
        materialName: data.materialName,
        unit: data.unit,
        quantity: data.quantity,
        estimatedUnitPrice: data.estimatedUnitPrice,
        specifications: data.specifications,
      },
    });
  }
}
