import { beforeEach, describe, expect, test, vi } from "vitest";

const repositoryMocks = vi.hoisted(() => ({
  findById: vi.fn(),
  findByTaskId: vi.fn(),
  findWorkspaceMember: vi.fn(),
  create: vi.fn(),
  updateStatus: vi.fn(),
  rememberMaterial: vi.fn(),
}));

const dbMocks = vi.hoisted(() => {
  const db: any = {
    project: { findFirst: vi.fn() },
    workspaceMember: { count: vi.fn(), findFirst: vi.fn(), findMany: vi.fn() },
    notification: { createMany: vi.fn() },
    indent: { update: vi.fn() },
    indentLineItem: { update: vi.fn(), updateMany: vi.fn(), create: vi.fn(), findFirst: vi.fn(), delete: vi.fn() },
    $transaction: vi.fn(async (callback: any) => callback(db)),
  };
  return db;
});

const broadcastProjectUpdate = vi.hoisted(() => vi.fn());

vi.mock("@/lib/db", () => ({ default: dbMocks }));
vi.mock("@/lib/realtime", () => ({ broadcastProjectUpdate }));
vi.mock("../indent/indent.repository", () => ({ IndentRepository: repositoryMocks }));

import { IndentService } from "../indent/indent.service";

const baseIndent = (overrides: Record<string, any> = {}) => ({
  id: "indent-1",
  workspaceId: "workspace-1",
  projectId: "project-1",
  requestedById: "requester-member",
  name: "Generated indent",
  status: "SUBMITTED",
  requestedBy: {
    id: "requester-member",
    reportToId: "manager-member",
    user: { id: "requester-user", name: "Requester", surname: "One" },
  },
  approverIds: ["owner-member"],
  approvedByIds: [],
  finalOwnerApprovedByIds: [],
  lineItems: [
    { id: "item-1", materialName: "Cement", estimatedUnitPrice: 40000, finalUnitPrice: null },
    { id: "item-2", materialName: "Steel", estimatedUnitPrice: 70000, finalUnitPrice: null },
  ],
  ...overrides,
});

describe("Indent approval workflow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    repositoryMocks.updateStatus.mockImplementation(async (_id, status, extra) => ({ status, ...extra }));
    dbMocks.workspaceMember.findMany.mockResolvedValue([]);
    dbMocks.notification.createMany.mockResolvedValue({ count: 1 });
    dbMocks.indent.update.mockImplementation(async ({ data }: any) => data);
    dbMocks.indentLineItem.update.mockImplementation(async ({ data }: any) => data);
  });

  test("Accounts cannot create or mutate an indent", async () => {
    repositoryMocks.findWorkspaceMember.mockResolvedValue({ id: "accounts-member", workspaceRole: "ACCOUNTS" });

    await expect(
      IndentService.createIndent(
        {
          projectId: "project-1",
          workspaceId: "workspace-1",
          lineItems: [],
          approverIds: ["owner-member"],
        },
        "accounts-user"
      )
    ).rejects.toMatchObject({ statusCode: 403 });
    expect(dbMocks.project.findFirst).not.toHaveBeenCalled();
  });

  test("creating an indent requires at least one chosen owner approver", async () => {
    repositoryMocks.findWorkspaceMember.mockResolvedValue({
      id: "requester-member",
      workspaceRole: "MEMBER",
    });

    await expect(
      IndentService.createIndent(
        {
          projectId: "project-1",
          workspaceId: "workspace-1",
          lineItems: [],
          approverIds: [],
        },
        "requester-user"
      )
    ).rejects.toMatchObject({ statusCode: 400 });

    expect(dbMocks.project.findFirst).not.toHaveBeenCalled();
    expect(repositoryMocks.create).not.toHaveBeenCalled();
  });

  test("manager estimate approval sends the indent to owner comparative authorization", async () => {
    repositoryMocks.findWorkspaceMember.mockResolvedValue({ id: "manager-member", workspaceRole: "MANAGER" });
    repositoryMocks.findById.mockResolvedValue(baseIndent());
    dbMocks.workspaceMember.findMany.mockResolvedValue([{ userId: "owner-user" }]);

    await IndentService.approveIndent("indent-1", "manager-user", "workspace-1");

    expect(repositoryMocks.updateStatus).toHaveBeenCalledWith(
      "indent-1",
      "PENDING_OWNER_COMPARATIVE_APPROVAL",
      expect.objectContaining({ managerApprovedById: "manager-member", approvedByIds: [] })
    );
    expect(dbMocks.notification.createMany).toHaveBeenCalled();
  });

  test("owner authorization starts comparatives and notifies the requester", async () => {
    repositoryMocks.findWorkspaceMember.mockResolvedValue({ id: "owner-member", workspaceRole: "OWNER" });
    repositoryMocks.findById.mockResolvedValue(
      baseIndent({ status: "PENDING_OWNER_COMPARATIVE_APPROVAL" })
    );

    await IndentService.approveIndent("indent-1", "owner-user", "workspace-1");

    expect(repositoryMocks.updateStatus).toHaveBeenCalledWith(
      "indent-1",
      "COMPARATIVES_IN_PROGRESS",
      expect.objectContaining({ approvedByIds: ["owner-member"], ownerAuthorizedAt: expect.any(Date) })
    );
    expect(dbMocks.notification.createMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: [expect.objectContaining({ userId: "requester-user" })] })
    );
  });

  test("an owner cannot authorize an indent with no selected approvers", async () => {
    repositoryMocks.findWorkspaceMember.mockResolvedValue({ id: "owner-member", workspaceRole: "OWNER" });
    repositoryMocks.findById.mockResolvedValue(
      baseIndent({
        status: "PENDING_OWNER_COMPARATIVE_APPROVAL",
        approverIds: [],
      })
    );

    await expect(
      IndentService.approveIndent("indent-1", "owner-user", "workspace-1")
    ).rejects.toMatchObject({ statusCode: 403 });

    expect(repositoryMocks.updateStatus).not.toHaveBeenCalled();
  });

  test("requester manual rates move to manager final-rate approval", async () => {
    repositoryMocks.findWorkspaceMember.mockResolvedValue({ id: "requester-member", workspaceRole: "MEMBER" });
    repositoryMocks.findById.mockResolvedValue(
      baseIndent({
        status: "COMPARATIVES_IN_PROGRESS",
        approvedByIds: ["owner-member"],
      })
    );
    dbMocks.workspaceMember.findFirst.mockResolvedValue({ userId: "manager-user" });

    await IndentService.submitFinalRates(
      "indent-1",
      [
        { itemId: "item-1", finalUnitPrice: 35000 },
        { itemId: "item-2", finalUnitPrice: 65000 },
      ],
      "requester-user",
      "workspace-1"
    );

    expect(dbMocks.indentLineItem.update).toHaveBeenCalledTimes(2);
    expect(dbMocks.indent.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "PENDING_MANAGER_FINAL_RATE_APPROVAL",
          finalRatesSubmittedById: "requester-member",
        }),
      })
    );
  });

  test("obsolete pending-payment records cannot bypass owner comparative authorization", async () => {
    repositoryMocks.findWorkspaceMember.mockResolvedValue({ id: "requester-member", workspaceRole: "MEMBER" });
    repositoryMocks.findById.mockResolvedValue(baseIndent({ status: "PENDING_PAYMENT" }));

    await expect(
      IndentService.submitFinalRates(
        "indent-1",
        [
          { itemId: "item-1", finalUnitPrice: 35000 },
          { itemId: "item-2", finalUnitPrice: 65000 },
        ],
        "requester-user",
        "workspace-1"
      )
    ).rejects.toMatchObject({ statusCode: 409 });

    expect(dbMocks.indentLineItem.update).not.toHaveBeenCalled();
  });

  test("comparatives status cannot bypass missing selected-owner approvals", async () => {
    repositoryMocks.findWorkspaceMember.mockResolvedValue({ id: "requester-member", workspaceRole: "MEMBER" });
    repositoryMocks.findById.mockResolvedValue(
      baseIndent({
        status: "COMPARATIVES_IN_PROGRESS",
        approverIds: ["owner-member", "second-owner-member"],
        approvedByIds: ["owner-member"],
      })
    );

    await expect(
      IndentService.submitFinalRates(
        "indent-1",
        [
          { itemId: "item-1", finalUnitPrice: 35000 },
          { itemId: "item-2", finalUnitPrice: 65000 },
        ],
        "requester-user",
        "workspace-1"
      )
    ).rejects.toMatchObject({ statusCode: 409 });

    expect(dbMocks.indentLineItem.update).not.toHaveBeenCalled();
  });

  test("a final owner rejection becomes an editable final-rate revision", async () => {
    repositoryMocks.findWorkspaceMember.mockResolvedValue({ id: "owner-member", workspaceRole: "OWNER" });
    repositoryMocks.findById.mockResolvedValue(
      baseIndent({ status: "PENDING_OWNER_FINAL_APPROVAL" })
    );

    await IndentService.rejectIndent("indent-1", "Please renegotiate", "owner-user", "workspace-1");

    expect(repositoryMocks.updateStatus).toHaveBeenCalledWith(
      "indent-1",
      "REJECTED",
      expect.objectContaining({
        rejectedStage: "FINAL",
        rejectedFromStatus: "PENDING_OWNER_FINAL_APPROVAL",
        rejectionReason: "Please renegotiate",
      })
    );
  });
});
