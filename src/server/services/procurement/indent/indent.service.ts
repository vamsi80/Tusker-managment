import prisma from "@/lib/db";
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
      approverIds?: string[];
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

    // Notify Managers
    const managers = await prisma.workspaceMember.findMany({
      where: { workspaceId, workspaceRole: { in: ["MANAGER", "ADMIN"] } },
      select: { userId: true },
    });

    if (managers.length > 0) {
      const { randomUUID } = require("crypto");
      await prisma.notification.createMany({
        data: managers.map(m => ({
          id: randomUUID(),
          userId: m.userId,
          workspaceId,
          title: "Indent Pending Manager Approval",
          body: `An indent "${indent.name}" has been submitted and is awaiting your approval.`,
          type: "INDENT_APPROVAL",
          entityId: indent.id,
          entityType: "Indent",
          createdAt: new Date(),
          updatedAt: new Date(),
        })),
      });
    }

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

    const assignee = await prisma.workspaceMember.findFirst({
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

    const indent = await IndentRepository.findById(indentId);
    if (!indent) throw AppError.NotFound("Indent not found");

    if (indent.status === "SUBMITTED") {
      // Stage 1: Manager Approval
      const allowedRoles = ["MANAGER", "ADMIN", "OWNER"];
      if (!allowedRoles.includes(member.workspaceRole)) {
        throw AppError.Forbidden("Only managers or admins can approve at this stage");
      }

      if (indent.approverIds && indent.approverIds.length > 0) {
        assertTransition(INDENT_TRANSITIONS, indent.status, "PENDING_OWNER_APPROVAL", "Indent");
        const updated = await IndentRepository.updateStatus(indentId, "PENDING_OWNER_APPROVAL", {
          managerApprovedAt: new Date(),
          managerApprovedById: member.id,
        });

        // Notify Owners
        const approverMembers = await prisma.workspaceMember.findMany({
          where: { id: { in: indent.approverIds } },
          select: { userId: true },
        });

        if (approverMembers.length > 0) {
          const { randomUUID } = require("crypto");
          await prisma.notification.createMany({
            data: approverMembers.map(m => ({
              id: randomUUID(),
              userId: m.userId,
              workspaceId,
              title: "Indent Approval Required",
              body: `Indent "${indent.name}" has been approved by the manager and requires your final approval.`,
              type: "INDENT_APPROVAL",
              entityId: indent.id,
              entityType: "Indent",
              createdAt: new Date(),
              updatedAt: new Date(),
            })),
          });
        }
        return updated;
      } else {
        // Skip Owner Approval if none requested
        assertTransition(INDENT_TRANSITIONS, indent.status, "PENDING_PAYMENT", "Indent");
        const updated = await IndentRepository.updateStatus(indentId, "PENDING_PAYMENT", {
          managerApprovedAt: new Date(),
          managerApprovedById: member.id,
          finalApprovedAt: new Date(),
          finalApprovedById: member.id,
        });

        // Notify Accounts
        const accountsMembers = await prisma.workspaceMember.findMany({
          where: { workspaceId, workspaceRole: "ADMIN" },
          select: { userId: true },
        });

        if (accountsMembers.length > 0) {
          const { randomUUID } = require("crypto");
          await prisma.notification.createMany({
            data: accountsMembers.map(m => ({
              id: randomUUID(),
              userId: m.userId,
              workspaceId,
              title: "Indent Pending Payment Approval",
              body: `Indent "${indent.name}" has been approved and is waiting for payment approval.`,
              type: "INDENT_APPROVAL",
              entityId: indent.id,
              entityType: "Indent",
              createdAt: new Date(),
              updatedAt: new Date(),
            })),
          });
        }
        return updated;
      }

    } else if (indent.status === "PENDING_OWNER_APPROVAL") {
      // Stage 2: Owner Approval
      if (indent.approverIds && indent.approverIds.length > 0) {
        if (!indent.approverIds.includes(member.id)) {
          throw AppError.Forbidden("You are not listed as an approver for this indent");
        }
      } else {
        const allowedRoles = ["OWNER", "ADMIN"];
        if (!allowedRoles.includes(member.workspaceRole)) {
          throw AppError.Forbidden("Insufficient permissions to approve indents");
        }
      }

      const currentApprovedIds = indent.approvedByIds || [];
      if (currentApprovedIds.includes(member.id)) {
        throw AppError.Conflict("You have already approved this indent");
      }

      const newApprovedIds = [...currentApprovedIds, member.id];
      const allApproved = indent.approverIds && indent.approverIds.length > 0 
        ? indent.approverIds.every(id => newApprovedIds.includes(id))
        : true;

      if (allApproved) {
        assertTransition(INDENT_TRANSITIONS, indent.status, "PENDING_PAYMENT", "Indent");
        const updated = await IndentRepository.updateStatus(indentId, "PENDING_PAYMENT", {
          approvedByIds: newApprovedIds,
          finalApprovedAt: new Date(),
          finalApprovedById: member.id,
        });

        // Notify Accounts
        const accountsMembers = await prisma.workspaceMember.findMany({
          where: { workspaceId, workspaceRole: "ADMIN" },
          select: { userId: true },
        });

        if (accountsMembers.length > 0) {
          const { randomUUID } = require("crypto");
          await prisma.notification.createMany({
            data: accountsMembers.map(m => ({
              id: randomUUID(),
              userId: m.userId,
              workspaceId,
              title: "Indent Pending Payment Approval",
              body: `Indent "${indent.name}" has been approved by all required owners and is waiting for payment approval.`,
              type: "INDENT_APPROVAL",
              entityId: indent.id,
              entityType: "Indent",
              createdAt: new Date(),
              updatedAt: new Date(),
            })),
          });
        }
        return updated;
      } else {
        return IndentRepository.updateStatus(indentId, indent.status, {
          approvedByIds: newApprovedIds,
        });
      }
    } else {
      throw AppError.Conflict("Indent has already passed the approval stages");
    }
  }

  static async cancelIndent(indentId: string, reason: string, userId: string, workspaceId: string) {
    const indent = await IndentRepository.findById(indentId);
    if (!indent) throw AppError.NotFound("Indent not found");

    const hasPOCreated = indent.lineItems.some((li: any) => li.status === "PO_CREATED");
    if (hasPOCreated) throw AppError.Conflict("Cannot cancel: some line items are already PO generated");

    assertTransition(INDENT_TRANSITIONS, indent.status, "CANCELLED", "Indent");

    await prisma.$transaction(async (tx) => {
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

    return prisma.indentLineItem.create({
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

    const item = await prisma.indentLineItem.findUnique({
      where: { id: itemId },
    });
    if (!item || item.indentId !== indentId) {
      throw AppError.NotFound("Line item not found in this indent");
    }

    return prisma.indentLineItem.delete({
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

    const item = await prisma.indentLineItem.findUnique({
      where: { id: itemId },
    });
    if (!item || item.indentId !== indentId) {
      throw AppError.NotFound("Line item not found in this indent");
    }

    return prisma.indentLineItem.update({
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
