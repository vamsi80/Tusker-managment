import { randomUUID } from "crypto";
import prisma from "@/lib/db";
import { AppError } from "@/lib/errors/app-error";
import { broadcastProjectUpdate } from "@/lib/realtime";
import { pusherServer } from "@/lib/pusher";
import { IndentRepository } from "./indent.repository";

type InitialLineItemInput = {
  materialCatalogId?: string;
  materialName: string;
  unit: string;
  quantity: number;
  estimatedUnitPrice?: number;
  specifications?: string | null;
};

export class IndentService {
  private static async getIndent(indentId: string, workspaceId: string) {
    const indent = await IndentRepository.findById(indentId);
    if (!indent || indent.workspaceId !== workspaceId) {
      throw AppError.NotFound("Indent not found");
    }
    return indent;
  }

  private static async getMember(userId: string, workspaceId: string) {
    const member = await IndentRepository.findWorkspaceMember(userId, workspaceId);
    if (!member) throw AppError.Forbidden("Not a workspace member");
    return member;
  }

  private static ensureCanMutate(member: { workspaceRole: string }) {
    if (member.workspaceRole === "ACCOUNTS") {
      throw AppError.Forbidden("Accounts has view-only access to procurement");
    }
  }

  private static ensureOptionalChargePercentages(data: {
    taxPercent?: number | null;
    exciseDutyPercent?: number | null;
    vatPercent?: number | null;
  }) {
    const charges = [
      ["Tax", data.taxPercent],
      ["Excise duty", data.exciseDutyPercent],
      ["VAT", data.vatPercent],
    ] as const;
    for (const [label, value] of charges) {
      if (value != null && (!Number.isFinite(value) || value < 0 || value > 100)) {
        throw AppError.ValidationError(`${label} must be between 0% and 100%`);
      }
    }
  }

  private static isManagerForIndent(member: { id: string; workspaceRole: string }, indent: any) {
    const reportingManagerId = indent.requestedBy?.reportToId;
    if (reportingManagerId) return member.id === reportingManagerId;
    return ["MANAGER", "ADMIN", "OWNER"].includes(member.workspaceRole);
  }

  private static isOwnerApprover(member: { id: string; workspaceRole: string }, indent: any) {
    return Boolean(
      indent.approverIds?.length &&
      indent.approverIds.includes(member.id) &&
      ["OWNER", "ADMIN"].includes(member.workspaceRole)
    );
  }

  private static ensureOwnerApprovers(indent: any) {
    if (!indent.approverIds?.length) {
      throw AppError.ValidationError("Select at least one owner for approval");
    }
  }

  private static haveAllSelectedOwnersApproved(indent: any, approvedIds: string[]) {
    return Boolean(
      indent.approverIds?.length &&
      indent.approverIds.every((id: string) => approvedIds.includes(id))
    );
  }

  private static async getManagerUserIds(indent: any, workspaceId: string) {
    if (indent.requestedBy?.reportToId) {
      const reportingManager = await prisma.workspaceMember.findFirst({
        where: { id: indent.requestedBy.reportToId, workspaceId },
        select: { userId: true },
      });
      if (reportingManager) return [reportingManager.userId];
    }

    const managers = await prisma.workspaceMember.findMany({
      where: { workspaceId, workspaceRole: "MANAGER" },
      select: { userId: true },
    });
    if (managers.length) return managers.map((manager) => manager.userId);

    const fallbackApprovers = await prisma.workspaceMember.findMany({
      where: { workspaceId, workspaceRole: { in: ["OWNER", "ADMIN"] } },
      select: { userId: true },
    });
    return fallbackApprovers.map((member) => member.userId);
  }

  private static async getOwnerUserIds(indent: any, workspaceId: string) {
    this.ensureOwnerApprovers(indent);
    const owners = await prisma.workspaceMember.findMany({
      where: { workspaceId, id: { in: indent.approverIds } },
      select: { userId: true },
    });
    return owners.map((owner) => owner.userId);
  }

  private static requesterName(indent: any) {
    return (
      [indent.requestedBy?.user?.name, indent.requestedBy?.user?.surname].filter(Boolean).join(" ") || "A member"
    );
  }

  private static async notify(
    userIds: string[],
    workspaceId: string,
    indentId: string,
    title: string,
    body: string,
    actorUserId?: string
  ) {
    const uniqueUserIds = [...new Set(userIds.filter(Boolean))].filter((id) => id !== actorUserId);
    if (!uniqueUserIds.length) return;
    const now = new Date();
    await prisma.notification.createMany({
      data: uniqueUserIds.map((userId) => ({
        id: randomUUID(),
        userId,
        workspaceId,
        title,
        body,
        type: "INDENT_APPROVAL",
        entityId: indentId,
        entityType: "Indent",
        createdAt: now,
        updatedAt: now,
      })),
    });

    if (pusherServer) {
      await pusherServer
        .trigger(
          uniqueUserIds.map((userId) => `user-${userId}`),
          "activity_log",
          {
            action: "INDENT_APPROVAL",
            title,
            message: title,
            newData: { text: body },
            userId: actorUserId,
            workspaceId,
            entityId: indentId,
            entityType: "Indent",
            notification: true,
          }
        )
        .catch((error: unknown) => console.error("[INDENT] notification push failed:", error));
    }
  }

  private static async broadcast(indent: { projectId: string }, workspaceId: string) {
    await broadcastProjectUpdate({
      workspaceId,
      projectId: indent.projectId,
      type: "UPDATE",
      action: "PROJECT_INDENT_UPDATED",
    } as any);
  }

  private static ensureApproximateRates(indent: any) {
    if (!indent.lineItems.length) {
      throw AppError.ValidationError("Add at least one material before submitting the indent");
    }
    const missing = indent.lineItems.find((item: any) => !item.estimatedUnitPrice || item.estimatedUnitPrice <= 0);
    if (missing) {
      throw AppError.ValidationError(`Enter an approximate rate for ${missing.materialName}`);
    }
  }

  static async createIndent(
    data: {
      taskId?: string;
      projectId: string;
      workspaceId: string;
      name?: string;
      description?: string;
      expectedDelivery?: Date;
      taxPercent?: number;
      exciseDutyPercent?: number;
      vatPercent?: number;
      lineItems?: InitialLineItemInput[];
      approverIds: string[];
    },
    userId: string
  ) {
    if (data.taskId) {
      const existing = await IndentRepository.findByTaskId(data.taskId);
      if (existing) throw AppError.Conflict("An indent already exists for this task");
    }

    const member = await this.getMember(userId, data.workspaceId);
    this.ensureCanMutate(member);
    this.ensureOptionalChargePercentages(data);

    if (!data.approverIds.length) {
      throw AppError.ValidationError("Select at least one owner for approval");
    }

    const project = await prisma.project.findFirst({
      where: { id: data.projectId, workspaceId: data.workspaceId },
      select: { name: true },
    });
    if (!project) throw AppError.NotFound("Project not found in this workspace");

    const validApprovers = await prisma.workspaceMember.count({
      where: {
        workspaceId: data.workspaceId,
        id: { in: data.approverIds },
        workspaceRole: { in: ["OWNER", "ADMIN"] },
      },
    });
    if (validApprovers !== new Set(data.approverIds).size) {
      throw AppError.ValidationError("Every selected approver must be an owner or admin in this workspace");
    }

    const firstMaterial = data.lineItems?.[0]?.materialName?.trim() || "Materials";
    const additionalCount = Math.max((data.lineItems?.length || 1) - 1, 0);
    const materialLabel = `${firstMaterial}${additionalCount ? ` +${additionalCount}` : ""}`;
    const dateLabel = new Intl.DateTimeFormat("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    }).format(new Date());
    const generatedName = `${project.name} - ${materialLabel} - ${dateLabel}`;

    return IndentRepository.create({
      ...data,
      name: data.name?.trim() || generatedName,
      requestedById: member.id,
    });
  }

  /** Owners, admins and managers run the indent; the requester only owns it while it is theirs to edit. */
  private static canManageIndent(member: { id: string; workspaceRole: string }, indent: any) {
    if (member.workspaceRole === "ACCOUNTS") return false;
    if (["OWNER", "ADMIN", "MANAGER"].includes(member.workspaceRole)) return true;
    return member.id === indent.requestedById && this.canEditInitialDetails(member, indent);
  }

  static async updateIndent(
    indentId: string,
    data: {
      name?: string;
      description?: string | null;
      expectedDelivery?: Date | null;
      taxPercent?: number | null;
      exciseDutyPercent?: number | null;
      vatPercent?: number | null;
      approverIds?: string[];
    },
    userId: string,
    workspaceId: string
  ) {
    const member = await this.getMember(userId, workspaceId);
    this.ensureCanMutate(member);
    this.ensureOptionalChargePercentages(data);
    const indent = await this.getIndent(indentId, workspaceId);

    if (!this.canManageIndent(member, indent)) {
      throw AppError.Forbidden("You cannot edit this indent");
    }
    if (["APPROVED", "CANCELLED"].includes(indent.status)) {
      throw AppError.Conflict("A closed indent can no longer be edited");
    }
    const changesOptionalCharges = [data.taxPercent, data.exciseDutyPercent, data.vatPercent].some(
      (value) => value !== undefined
    );
    if (changesOptionalCharges && !this.canEditInitialDetails(member, indent)) {
      throw AppError.Conflict("Taxes and duties can only be changed while the indent is a draft or initial revision");
    }
    if (data.name !== undefined && !data.name.trim()) {
      throw AppError.ValidationError("Indent name cannot be empty");
    }

    let approverReset: Record<string, string[]> = {};
    if (data.approverIds) {
      if (!data.approverIds.length) {
        throw AppError.ValidationError("Select at least one owner for approval");
      }
      const validApprovers = await prisma.workspaceMember.count({
        where: {
          workspaceId,
          id: { in: data.approverIds },
          workspaceRole: { in: ["OWNER", "ADMIN"] },
        },
      });
      if (validApprovers !== new Set(data.approverIds).size) {
        throw AppError.ValidationError("Every selected approver must be an owner or admin in this workspace");
      }
      // Approvals belong to the people still on the list - drop the ones who left it.
      approverReset = {
        approvedByIds: (indent.approvedByIds || []).filter((id: string) => data.approverIds!.includes(id)),
        finalOwnerApprovedByIds: (indent.finalOwnerApprovedByIds || []).filter((id: string) =>
          data.approverIds!.includes(id)
        ),
      };
    }

    const updated = await prisma.indent.update({
      where: { id: indentId },
      data: {
        name: data.name?.trim(),
        description: data.description,
        expectedDelivery: data.expectedDelivery,
        taxPercent: data.taxPercent,
        exciseDutyPercent: data.exciseDutyPercent,
        vatPercent: data.vatPercent,
        ...(data.approverIds ? { approverIds: data.approverIds, ...approverReset } : {}),
      },
    });
    await this.broadcast(indent, workspaceId);
    return updated;
  }

  static async deleteIndent(indentId: string, userId: string, workspaceId: string) {
    const member = await this.getMember(userId, workspaceId);
    this.ensureCanMutate(member);
    if (!["OWNER", "ADMIN", "MANAGER"].includes(member.workspaceRole)) {
      throw AppError.Forbidden("Only an owner, admin or manager can delete an indent");
    }
    const indent = await this.getIndent(indentId, workspaceId);

    // A purchase order already refers to these materials - cancel the indent instead.
    if (indent.lineItems.some((item: any) => item.status === "PO_CREATED")) {
      throw AppError.Conflict("Cannot delete: some line items are already PO generated");
    }

    await prisma.indent.delete({ where: { id: indentId } });
    await this.broadcast(indent, workspaceId);
    return { id: indentId };
  }

  static async submitIndent(indentId: string, userId: string, workspaceId: string) {
    const member = await this.getMember(userId, workspaceId);
    this.ensureCanMutate(member);
    const indent = await this.getIndent(indentId, workspaceId);

    if (indent.status !== "DRAFT") {
      throw AppError.Conflict("Only a draft indent can be submitted");
    }
    if (member.id !== indent.requestedById && !["OWNER", "ADMIN", "MANAGER"].includes(member.workspaceRole)) {
      throw AppError.Forbidden("Only the requester can submit this indent");
    }
    this.ensureOwnerApprovers(indent);
    this.ensureApproximateRates(indent);

    const updated = await IndentRepository.updateStatus(indentId, "SUBMITTED", {
      submittedAt: new Date(),
      rejectedAt: null,
      rejectedById: null,
      rejectedFromStatus: null,
      rejectedStage: null,
      rejectionReason: null,
    });

    await this.notify(
      await this.getManagerUserIds(indent, workspaceId),
      workspaceId,
      indent.id,
      "Indent needs your approval",
      `${this.requesterName(indent)} raised indent ${indent.indentId || indent.name} for ${indent.project?.name || "a project"}. Approve the approximate rates to move it forward.`,
      userId
    );
    await this.broadcast(indent, workspaceId);
    return updated;
  }

  static async resubmitIndent(indentId: string, userId: string, workspaceId: string) {
    const member = await this.getMember(userId, workspaceId);
    this.ensureCanMutate(member);
    const indent = await this.getIndent(indentId, workspaceId);
    if (indent.status !== "REJECTED") throw AppError.Conflict("Only a rejected indent can be resubmitted");
    if (member.id !== indent.requestedById) throw AppError.Forbidden("Only the requester can resubmit this indent");

    const isFinalRevision = indent.rejectedStage === "FINAL";
    this.ensureOwnerApprovers(indent);
    if (isFinalRevision) {
      const missing = indent.lineItems.find((item: any) => !item.finalUnitPrice || item.finalUnitPrice <= 0);
      if (missing) throw AppError.ValidationError(`Enter a final rate for ${missing.materialName}`);
    } else {
      this.ensureApproximateRates(indent);
    }

    const nextStatus = isFinalRevision ? "PENDING_MANAGER_FINAL_RATE_APPROVAL" : "SUBMITTED";
    const updated = await IndentRepository.updateStatus(indentId, nextStatus, {
      rejectedAt: null,
      rejectedById: null,
      rejectedFromStatus: null,
      rejectedStage: null,
      rejectionReason: null,
      ...(isFinalRevision
        ? {
            finalRatesSubmittedAt: new Date(),
            finalRatesSubmittedById: member.id,
            finalManagerApprovedAt: null,
            finalManagerApprovedById: null,
            finalOwnerApprovedByIds: [],
          }
        : {
            submittedAt: new Date(),
            managerApprovedAt: null,
            managerApprovedById: null,
            ownerAuthorizedAt: null,
            approvedByIds: [],
            finalRatesSubmittedAt: null,
            finalRatesSubmittedById: null,
            finalManagerApprovedAt: null,
            finalManagerApprovedById: null,
            finalOwnerApprovedByIds: [],
            finalApprovedAt: null,
            finalApprovedById: null,
          }),
    });

    await this.notify(
      await this.getManagerUserIds(indent, workspaceId),
      workspaceId,
      indent.id,
      isFinalRevision ? "Final rates resubmitted" : "Indent resubmitted",
      isFinalRevision
        ? `Revised final rates for "${indent.name}" are ready for approval.`
        : `Revised approximate rates for "${indent.name}" are ready for approval.`,
      userId
    );
    await this.broadcast(indent, workspaceId);
    return updated;
  }

  static async assignIndent(indentId: string, assigneeId: string, userId: string, workspaceId: string) {
    const member = await this.getMember(userId, workspaceId);
    this.ensureCanMutate(member);
    if (!["OWNER", "ADMIN", "MANAGER", "PROCUREMENT"].includes(member.workspaceRole)) {
      throw AppError.Forbidden("Insufficient permissions to assign indents");
    }
    const indent = await this.getIndent(indentId, workspaceId);
    if (indent.status !== "SUBMITTED") throw AppError.Conflict("Only submitted indents can be assigned");

    const assignee = await prisma.workspaceMember.findFirst({ where: { id: assigneeId, workspaceId } });
    if (!assignee) throw AppError.NotFound("Assignee not found in workspace");
    return IndentRepository.updateStatus(indentId, "ASSIGNED", { assignedToId: assigneeId });
  }

  static async approveIndent(indentId: string, userId: string, workspaceId: string) {
    const member = await this.getMember(userId, workspaceId);
    this.ensureCanMutate(member);
    const indent = await this.getIndent(indentId, workspaceId);

    if (indent.status === "SUBMITTED" || indent.status === "ASSIGNED") {
      if (!this.isManagerForIndent(member, indent)) {
        throw AppError.Forbidden("Only the requester's manager can approve approximate rates");
      }
      this.ensureOwnerApprovers(indent);
      const updated = await IndentRepository.updateStatus(indentId, "PENDING_OWNER_COMPARATIVE_APPROVAL", {
        managerApprovedAt: new Date(),
        managerApprovedById: member.id,
        approvedByIds: [],
      });
      await this.notify(
        await this.getOwnerUserIds(indent, workspaceId),
        workspaceId,
        indent.id,
        "Get procurement comparitives",
        `Approximate rates for "${indent.name}" were approved by the manager. Authorize the requester to get comparatives.`,
        userId
      );
      await this.broadcast(indent, workspaceId);
      return updated;
    }

    if (indent.status === "PENDING_OWNER_COMPARATIVE_APPROVAL" || indent.status === "PENDING_OWNER_APPROVAL") {
      if (!this.isOwnerApprover(member, indent)) {
        throw AppError.Forbidden("Only a selected owner can get comparitives");
      }
      const currentApprovedIds = indent.approvedByIds || [];
      if (currentApprovedIds.includes(member.id)) throw AppError.Conflict("You have already authorized this indent");
      const approvedByIds = [...currentApprovedIds, member.id];
      const allApproved = this.haveAllSelectedOwnersApproved(indent, approvedByIds);

      const updated = await IndentRepository.updateStatus(
        indentId,
        allApproved ? "COMPARATIVES_IN_PROGRESS" : "PENDING_OWNER_COMPARATIVE_APPROVAL",
        {
          approvedByIds,
          ...(allApproved ? { ownerAuthorizedAt: new Date() } : {}),
        }
      );
      if (allApproved) {
        await this.notify(
          [indent.requestedBy.user.id],
          workspaceId,
          indent.id,
          "Start getting comparatives",
          `Approximate rates for "${indent.name}" are authorized. Get comparative prices and enter the least final rates.`,
          userId
        );
      }
      await this.broadcast(indent, workspaceId);
      return updated;
    }

    if (indent.status === "PENDING_MANAGER_FINAL_RATE_APPROVAL") {
      if (!this.isManagerForIndent(member, indent)) {
        throw AppError.Forbidden("Only the requester's manager can approve final rates");
      }
      const updated = await IndentRepository.updateStatus(indentId, "PENDING_OWNER_FINAL_APPROVAL", {
        finalManagerApprovedAt: new Date(),
        finalManagerApprovedById: member.id,
        finalOwnerApprovedByIds: [],
      });
      await this.notify(
        await this.getOwnerUserIds(indent, workspaceId),
        workspaceId,
        indent.id,
        "Final procurement approval required",
        `The manager approved the final rates for "${indent.name}". Final owner approval is required.`,
        userId
      );
      await this.broadcast(indent, workspaceId);
      return updated;
    }

    if (indent.status === "PENDING_OWNER_FINAL_APPROVAL") {
      if (!this.isOwnerApprover(member, indent)) {
        throw AppError.Forbidden("Only a selected owner can give final approval");
      }
      const currentApprovedIds = indent.finalOwnerApprovedByIds || [];
      if (currentApprovedIds.includes(member.id)) throw AppError.Conflict("You have already given final approval");
      const finalOwnerApprovedByIds = [...currentApprovedIds, member.id];
      const allApproved = this.haveAllSelectedOwnersApproved(indent, finalOwnerApprovedByIds);
      const updated = await IndentRepository.updateStatus(
        indentId,
        allApproved ? "APPROVED" : "PENDING_OWNER_FINAL_APPROVAL",
        {
          finalOwnerApprovedByIds,
          ...(allApproved
            ? { finalApprovedAt: new Date(), finalApprovedById: member.id }
            : {}),
        }
      );
      if (allApproved) {
        await this.notify(
          [indent.requestedBy.user.id],
          workspaceId,
          indent.id,
          "Indent finally approved",
          `The final rates for "${indent.name}" have been approved.`,
          userId
        );
      }
      await this.broadcast(indent, workspaceId);
      return updated;
    }

    throw AppError.Conflict("Indent is not awaiting your approval");
  }

  static async submitFinalRates(
    indentId: string,
    rates: { itemId: string; finalUnitPrice: number }[],
    vendorId: string,
    userId: string,
    workspaceId: string
  ) {
    const member = await this.getMember(userId, workspaceId);
    this.ensureCanMutate(member);
    const indent = await this.getIndent(indentId, workspaceId);
    const allowed =
      indent.status === "COMPARATIVES_IN_PROGRESS" ||
      (indent.status === "REJECTED" && indent.rejectedStage === "FINAL");
    if (!allowed) throw AppError.Conflict("Final rates cannot be entered at this stage");
    this.ensureOwnerApprovers(indent);
    if (!this.haveAllSelectedOwnersApproved(indent, indent.approvedByIds || [])) {
      throw AppError.Conflict("Every selected owner must get comparitives before final rates can be entered");
    }
    if (member.id !== indent.requestedById) {
      throw AppError.Forbidden("Only the original requester can enter final rates");
    }

    const vendor = await prisma.vendor.findFirst({
      where: { id: vendorId, workspaceId },
      select: { id: true },
    });
    if (!vendor) throw AppError.ValidationError("Select the vendor these rates came from");

    const rateByItemId = new Map(rates.map((rate) => [rate.itemId, rate.finalUnitPrice]));
    for (const item of indent.lineItems) {
      const rate = rateByItemId.get(item.id);
      if (!rate || rate <= 0) throw AppError.ValidationError(`Enter a final rate for ${item.materialName}`);
    }

    const updated = await prisma.$transaction(async (tx) => {
      await Promise.all(
        indent.lineItems.map((item) =>
          tx.indentLineItem.update({
            where: { id: item.id },
            data: { finalUnitPrice: rateByItemId.get(item.id)! },
          })
        )
      );
      return tx.indent.update({
        where: { id: indentId },
        data: {
          status: "PENDING_MANAGER_FINAL_RATE_APPROVAL",
          selectedVendorId: vendorId,
          finalRatesSubmittedAt: new Date(),
          finalRatesSubmittedById: member.id,
          finalManagerApprovedAt: null,
          finalManagerApprovedById: null,
          finalOwnerApprovedByIds: [],
          rejectedAt: null,
          rejectedById: null,
          rejectedFromStatus: null,
          rejectedStage: null,
          rejectionReason: null,
        },
      });
    });

    await this.notify(
      await this.getManagerUserIds(indent, workspaceId),
      workspaceId,
      indent.id,
      "Final rates pending approval",
      `The requester entered final rates for "${indent.name}". Review and approve them.`,
      userId
    );
    await this.broadcast(indent, workspaceId);
    return updated;
  }

  static async rejectIndent(indentId: string, reason: string, userId: string, workspaceId: string) {
    const member = await this.getMember(userId, workspaceId);
    this.ensureCanMutate(member);
    const indent = await this.getIndent(indentId, workspaceId);
    const initialStatuses = ["SUBMITTED", "ASSIGNED", "PENDING_OWNER_COMPARATIVE_APPROVAL", "PENDING_OWNER_APPROVAL"];
    const finalStatuses = ["PENDING_MANAGER_FINAL_RATE_APPROVAL", "PENDING_OWNER_FINAL_APPROVAL"];
    if (![...initialStatuses, ...finalStatuses].includes(indent.status)) {
      throw AppError.Conflict("Indent cannot be rejected at this stage");
    }

    const isManagerStage = indent.status === "SUBMITTED" || indent.status === "ASSIGNED" || indent.status === "PENDING_MANAGER_FINAL_RATE_APPROVAL";
    if (isManagerStage && !this.isManagerForIndent(member, indent)) {
      throw AppError.Forbidden("Only the requester's manager can reject at this stage");
    }
    if (!isManagerStage && !this.isOwnerApprover(member, indent)) {
      throw AppError.Forbidden("Only a selected owner can reject at this stage");
    }

    const rejectedStage = finalStatuses.includes(indent.status) ? "FINAL" : "INITIAL";
    const updated = await IndentRepository.updateStatus(indentId, "REJECTED", {
      rejectedAt: new Date(),
      rejectedById: member.id,
      rejectedFromStatus: indent.status,
      rejectedStage,
      rejectionReason: reason,
      revisionCount: { increment: 1 },
    });
    await this.notify(
      [indent.requestedBy.user.id],
      workspaceId,
      indent.id,
      "Indent rejected for revision",
      `"${indent.name}" was rejected: ${reason}. Edit it and resubmit for approval.`,
      userId
    );
    await this.broadcast(indent, workspaceId);
    return updated;
  }

  static async cancelIndent(indentId: string, reason: string, userId: string, workspaceId: string) {
    const member = await this.getMember(userId, workspaceId);
    this.ensureCanMutate(member);
    const indent = await this.getIndent(indentId, workspaceId);
    if (member.id !== indent.requestedById && !["OWNER", "ADMIN", "MANAGER"].includes(member.workspaceRole)) {
      throw AppError.Forbidden("You cannot cancel this indent");
    }
    if (["APPROVED", "CANCELLED"].includes(indent.status)) {
      throw AppError.Conflict("This indent can no longer be cancelled");
    }
    const hasPOCreated = indent.lineItems.some((item: any) => item.status === "PO_CREATED");
    if (hasPOCreated) throw AppError.Conflict("Cannot cancel: some line items are already PO generated");

    const updated = await prisma.$transaction(async (tx) => {
      await tx.indentLineItem.updateMany({
        where: { indentId, status: { in: ["PENDING", "RFQ_SENT", "QUOTES_RECEIVED"] } },
        data: { status: "REJECTED" },
      });
      return tx.indent.update({
        where: { id: indentId },
        data: { status: "CANCELLED", cancelledAt: new Date(), cancelReason: reason },
      });
    });
    await this.broadcast(indent, workspaceId);
    return updated;
  }

  private static canEditInitialDetails(member: { id: string; workspaceRole: string }, indent: any) {
    if (member.workspaceRole === "ACCOUNTS") return false;
    const editableStatus = indent.status === "DRAFT" || (indent.status === "REJECTED" && indent.rejectedStage !== "FINAL");
    if (!editableStatus) return false;
    return member.id === indent.requestedById || ["OWNER", "ADMIN", "MANAGER"].includes(member.workspaceRole);
  }

  /**
   * The manager and the selected owners can revise the numbers while an indent is
   * sitting in their review stage: approximate rates in the first round, final rates
   * in the second. Returns which round they are in, or null if they may not revise.
   */
  private static reviewerRevisionStage(
    member: { id: string; workspaceRole: string },
    indent: any
  ): "ESTIMATE" | "FINAL" | null {
    if (member.workspaceRole === "ACCOUNTS") return null;

    const managerStages: Record<string, "ESTIMATE" | "FINAL"> = {
      SUBMITTED: "ESTIMATE",
      ASSIGNED: "ESTIMATE",
      PENDING_MANAGER_FINAL_RATE_APPROVAL: "FINAL",
    };
    const ownerStages: Record<string, "ESTIMATE" | "FINAL"> = {
      PENDING_OWNER_APPROVAL: "ESTIMATE",
      PENDING_OWNER_COMPARATIVE_APPROVAL: "ESTIMATE",
      PENDING_OWNER_FINAL_APPROVAL: "FINAL",
    };

    if (managerStages[indent.status]) {
      return this.isManagerForIndent(member, indent) ? managerStages[indent.status] : null;
    }
    if (ownerStages[indent.status]) {
      return this.isOwnerApprover(member, indent) ? ownerStages[indent.status] : null;
    }
    return null;
  }

  static async addLineItem(
    indentId: string,
    data: InitialLineItemInput,
    userId: string,
    workspaceId: string
  ) {
    const member = await this.getMember(userId, workspaceId);
    const indent = await this.getIndent(indentId, workspaceId);
    if (!this.canEditInitialDetails(member, indent)) {
      throw AppError.Forbidden("This indent is not editable at the current stage");
    }

    return prisma.$transaction(async (tx) => {
      const material = await IndentRepository.rememberMaterial(
        workspaceId,
        data.materialName,
        data.unit,
        tx,
        data.materialCatalogId
      );
      const item = await tx.indentLineItem.create({
        data: {
          indentId,
          materialCatalogId: material.id,
          materialName: data.materialName.trim(),
          unit: data.unit.trim(),
          quantity: data.quantity,
          estimatedUnitPrice: data.estimatedUnitPrice,
          specifications: data.specifications,
          status: "PENDING",
        },
      });
      return item;
    });
  }

  static async removeLineItem(indentId: string, itemId: string, userId: string, workspaceId: string) {
    const member = await this.getMember(userId, workspaceId);
    const indent = await this.getIndent(indentId, workspaceId);
    if (!this.canEditInitialDetails(member, indent)) {
      throw AppError.Forbidden("This indent is not editable at the current stage");
    }
    const item = await prisma.indentLineItem.findFirst({ where: { id: itemId, indentId } });
    if (!item) throw AppError.NotFound("Line item not found in this indent");
    return prisma.indentLineItem.delete({ where: { id: itemId } });
  }

  static async updateLineItem(
    indentId: string,
    itemId: string,
    data: Partial<InitialLineItemInput> & { finalUnitPrice?: number },
    userId: string,
    workspaceId: string
  ) {
    const member = await this.getMember(userId, workspaceId);
    const indent = await this.getIndent(indentId, workspaceId);
    const canEditAll = this.canEditInitialDetails(member, indent);
    const revisionStage = canEditAll ? null : this.reviewerRevisionStage(member, indent);
    if (!canEditAll && !revisionStage) {
      throw AppError.Forbidden("This indent is not editable at the current stage");
    }
    const item = await prisma.indentLineItem.findFirst({ where: { id: itemId, indentId } });
    if (!item) throw AppError.NotFound("Line item not found in this indent");

    if (revisionStage) {
      if (data.quantity !== undefined && data.quantity <= 0) {
        throw AppError.ValidationError("Quantity must be greater than 0");
      }
      // A revised number voids the approvals already collected in this round, so no
      // approver is ever counted for a figure they did not see.
      return prisma.$transaction(async (tx) => {
        const updated = await tx.indentLineItem.update({
          where: { id: itemId },
          data:
            revisionStage === "FINAL"
              ? { quantity: data.quantity, finalUnitPrice: data.finalUnitPrice }
              : { quantity: data.quantity, estimatedUnitPrice: data.estimatedUnitPrice },
        });
        await tx.indent.update({
          where: { id: indentId },
          data: revisionStage === "FINAL" ? { finalOwnerApprovedByIds: [] } : { approvedByIds: [] },
        });
        return updated;
      });
    }

    return prisma.$transaction(async (tx) => {
      const material = await IndentRepository.rememberMaterial(
        workspaceId,
        data.materialName || item.materialName,
        data.unit || item.unit,
        tx,
        data.materialCatalogId || (data.materialName === undefined ? item.materialCatalogId || undefined : undefined)
      );
      const updated = await tx.indentLineItem.update({
        where: { id: itemId },
        data: {
          materialCatalogId: material.id,
          materialName: data.materialName?.trim(),
          unit: data.unit?.trim(),
          quantity: data.quantity,
          estimatedUnitPrice: data.estimatedUnitPrice,
          specifications: data.specifications,
        },
      });
      return updated;
    });
  }
}
