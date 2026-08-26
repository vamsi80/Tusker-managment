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
    vendor: { findFirst: vi.fn() },
    notification: { createMany: vi.fn() },
    indent: { update: vi.fn(), delete: vi.fn() },
    indentLineItem: { update: vi.fn(), updateMany: vi.fn(), create: vi.fn(), findFirst: vi.fn(), delete: vi.fn() },
    $transaction: vi.fn(async (callback: any) => callback(db)),
  };
  return db;
});

const broadcastProjectUpdate = vi.hoisted(() => vi.fn());
const pusherTrigger = vi.hoisted(() => vi.fn());

vi.mock("@/lib/db", () => ({ default: dbMocks }));
vi.mock("@/lib/realtime", () => ({ broadcastProjectUpdate }));
vi.mock("@/lib/pusher", () => ({ pusherServer: { trigger: pusherTrigger } }));
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
    pusherTrigger.mockResolvedValue(undefined);
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

  test("optional tax, excise duty and VAT percentages are persisted on creation", async () => {
    repositoryMocks.findWorkspaceMember.mockResolvedValue({ id: "requester-member", workspaceRole: "MEMBER" });
    dbMocks.project.findFirst.mockResolvedValue({ name: "Tower A" });
    dbMocks.workspaceMember.count.mockResolvedValue(1);
    repositoryMocks.create.mockResolvedValue({ id: "indent-1" });

    await IndentService.createIndent(
      {
        projectId: "project-1",
        workspaceId: "workspace-1",
        approverIds: ["owner-member"],
        taxPercent: 5,
        exciseDutyPercent: 2.5,
        vatPercent: 12.5,
        lineItems: [{ materialName: "Cement", unit: "bag", quantity: 10, estimatedUnitPrice: 40000 }],
      },
      "requester-user"
    );

    expect(repositoryMocks.create).toHaveBeenCalledWith(
      expect.objectContaining({ taxPercent: 5, exciseDutyPercent: 2.5, vatPercent: 12.5 })
    );
  });

  test("optional transport and labour charges are persisted as flat amounts", async () => {
    repositoryMocks.findWorkspaceMember.mockResolvedValue({ id: "requester-member", workspaceRole: "MEMBER" });
    dbMocks.project.findFirst.mockResolvedValue({ name: "Tower A" });
    dbMocks.workspaceMember.count.mockResolvedValue(1);
    repositoryMocks.create.mockResolvedValue({ id: "indent-1" });

    await IndentService.createIndent(
      {
        projectId: "project-1",
        workspaceId: "workspace-1",
        approverIds: ["owner-member"],
        transportCharge: 250000,
        labourCharge: 80000,
        lineItems: [{ materialName: "Cement", unit: "bag", quantity: 10, estimatedUnitPrice: 40000 }],
      },
      "requester-user"
    );

    expect(repositoryMocks.create).toHaveBeenCalledWith(
      expect.objectContaining({ transportCharge: 250000, labourCharge: 80000 })
    );
  });

  test("a negative flat charge is rejected", async () => {
    repositoryMocks.findWorkspaceMember.mockResolvedValue({ id: "requester-member", workspaceRole: "MEMBER" });

    await expect(
      IndentService.createIndent(
        {
          projectId: "project-1",
          workspaceId: "workspace-1",
          approverIds: ["owner-member"],
          transportCharge: -100,
          lineItems: [],
        },
        "requester-user"
      )
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(repositoryMocks.create).not.toHaveBeenCalled();
  });

  test("submitting an indent stores and pushes an approval notification to the manager", async () => {
    repositoryMocks.findWorkspaceMember.mockResolvedValue({ id: "requester-member", workspaceRole: "MEMBER" });
    repositoryMocks.findById.mockResolvedValue(baseIndent({ status: "DRAFT", indentId: "260001" }));
    dbMocks.workspaceMember.findFirst.mockResolvedValue({ userId: "manager-user" });

    await IndentService.submitIndent("indent-1", "requester-user", "workspace-1");

    expect(dbMocks.notification.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: [
          expect.objectContaining({
            userId: "manager-user",
            title: "Indent needs your approval",
            type: "INDENT_APPROVAL",
          }),
        ],
      })
    );
    expect(pusherTrigger).toHaveBeenCalledWith(
      ["user-manager-user"],
      "activity_log",
      expect.objectContaining({ action: "INDENT_APPROVAL", notification: true })
    );
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
    dbMocks.vendor.findFirst.mockResolvedValue({ id: "vendor-1" });

    await IndentService.submitFinalRates(
      "indent-1",
      [
        { itemId: "item-1", finalUnitPrice: 35000 },
        { itemId: "item-2", finalUnitPrice: 65000 },
      ],
      "vendor-1",
      "requester-user",
      "workspace-1"
    );

    expect(dbMocks.indentLineItem.update).toHaveBeenCalledTimes(2);
    expect(dbMocks.indent.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "PENDING_MANAGER_FINAL_RATE_APPROVAL",
          selectedVendorId: "vendor-1",
          finalRatesSubmittedById: "requester-member",
        }),
      })
    );
  });

  test("requester can submit final rates without selecting a vendor", async () => {
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
      undefined,
      "requester-user",
      "workspace-1"
    );

    expect(dbMocks.vendor.findFirst).not.toHaveBeenCalled();
    expect(dbMocks.indent.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.not.objectContaining({ selectedVendorId: expect.anything() }),
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
        "vendor-1",
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
        "vendor-1",
        "requester-user",
        "workspace-1"
      )
    ).rejects.toMatchObject({ statusCode: 409 });

    expect(dbMocks.indentLineItem.update).not.toHaveBeenCalled();
  });

  test("the manager can revise quantity and approximate rate while reviewing", async () => {
    repositoryMocks.findWorkspaceMember.mockResolvedValue({ id: "manager-member", workspaceRole: "MANAGER" });
    repositoryMocks.findById.mockResolvedValue(baseIndent({ status: "SUBMITTED", approvedByIds: ["owner-member"] }));
    dbMocks.indentLineItem.findFirst.mockResolvedValue({ id: "item-1", indentId: "indent-1", materialName: "Cement", unit: "bag" });

    const updated = await IndentService.updateLineItem(
      "indent-1",
      "item-1",
      { quantity: 12, estimatedUnitPrice: 45000 },
      "manager-user",
      "workspace-1"
    );

    expect(updated).toMatchObject({ quantity: 12, estimatedUnitPrice: 45000 });
    // the revision voids approvals already collected in this round
    expect(dbMocks.indent.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { approvedByIds: [] } })
    );
  });

  test("an owner revising final rates voids the final approvals collected so far", async () => {
    repositoryMocks.findWorkspaceMember.mockResolvedValue({ id: "owner-member", workspaceRole: "OWNER" });
    repositoryMocks.findById.mockResolvedValue(
      baseIndent({ status: "PENDING_OWNER_FINAL_APPROVAL", finalOwnerApprovedByIds: ["other-owner"] })
    );
    dbMocks.indentLineItem.findFirst.mockResolvedValue({ id: "item-1", indentId: "indent-1", materialName: "Cement", unit: "bag" });

    const updated = await IndentService.updateLineItem(
      "indent-1",
      "item-1",
      { finalUnitPrice: 38000 },
      "owner-user",
      "workspace-1"
    );

    expect(updated).toMatchObject({ finalUnitPrice: 38000 });
    expect(dbMocks.indent.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { finalOwnerApprovedByIds: [] } })
    );
  });

  test("the requester cannot edit line items once the indent is under review", async () => {
    repositoryMocks.findWorkspaceMember.mockResolvedValue({ id: "requester-member", workspaceRole: "MEMBER" });
    repositoryMocks.findById.mockResolvedValue(baseIndent({ status: "SUBMITTED" }));

    await expect(
      IndentService.updateLineItem("indent-1", "item-1", { quantity: 99 }, "requester-user", "workspace-1")
    ).rejects.toMatchObject({ statusCode: 403 });
    expect(dbMocks.indentLineItem.update).not.toHaveBeenCalled();
  });

  test("a manager can edit an indent that is already under review", async () => {
    repositoryMocks.findWorkspaceMember.mockResolvedValue({ id: "manager-member", workspaceRole: "MANAGER" });
    repositoryMocks.findById.mockResolvedValue(baseIndent({ status: "PENDING_OWNER_COMPARATIVE_APPROVAL" }));

    await IndentService.updateIndent(
      "indent-1",
      { name: "Revised indent", expectedDelivery: null },
      "manager-user",
      "workspace-1"
    );

    expect(dbMocks.indent.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "indent-1" },
        data: expect.objectContaining({ name: "Revised indent", expectedDelivery: null }),
      })
    );
  });

  test("taxes and duties cannot be changed after the initial approval stage", async () => {
    repositoryMocks.findWorkspaceMember.mockResolvedValue({ id: "manager-member", workspaceRole: "MANAGER" });
    repositoryMocks.findById.mockResolvedValue(baseIndent({ status: "PENDING_OWNER_COMPARATIVE_APPROVAL" }));

    await expect(
      IndentService.updateIndent("indent-1", { taxPercent: 10 }, "manager-user", "workspace-1")
    ).rejects.toMatchObject({ statusCode: 409 });

    expect(dbMocks.indent.update).not.toHaveBeenCalled();
  });

  test("dropping an approver drops the approval they had given", async () => {
    repositoryMocks.findWorkspaceMember.mockResolvedValue({ id: "owner-member", workspaceRole: "OWNER" });
    repositoryMocks.findById.mockResolvedValue(
      baseIndent({
        status: "PENDING_OWNER_COMPARATIVE_APPROVAL",
        approverIds: ["owner-member", "second-owner-member"],
        approvedByIds: ["second-owner-member"],
      })
    );
    dbMocks.workspaceMember.count.mockResolvedValue(1);

    await IndentService.updateIndent("indent-1", { approverIds: ["owner-member"] }, "owner-user", "workspace-1");

    expect(dbMocks.indent.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ approverIds: ["owner-member"], approvedByIds: [] }),
      })
    );
  });

  test("a plain member cannot edit or delete an indent", async () => {
    repositoryMocks.findWorkspaceMember.mockResolvedValue({ id: "someone-else", workspaceRole: "MEMBER" });
    repositoryMocks.findById.mockResolvedValue(baseIndent({ status: "SUBMITTED" }));

    await expect(
      IndentService.updateIndent("indent-1", { name: "Nope" }, "other-user", "workspace-1")
    ).rejects.toMatchObject({ statusCode: 403 });
    await expect(
      IndentService.deleteIndent("indent-1", "other-user", "workspace-1")
    ).rejects.toMatchObject({ statusCode: 403 });
    expect(dbMocks.indent.delete).not.toHaveBeenCalled();
  });

  test("an admin deletes an indent, but not once a PO exists", async () => {
    repositoryMocks.findWorkspaceMember.mockResolvedValue({ id: "admin-member", workspaceRole: "ADMIN" });
    repositoryMocks.findById.mockResolvedValue(
      baseIndent({ status: "APPROVED", lineItems: [{ id: "item-1", status: "PO_CREATED" }] })
    );

    await expect(
      IndentService.deleteIndent("indent-1", "admin-user", "workspace-1")
    ).rejects.toMatchObject({ statusCode: 409 });
    expect(dbMocks.indent.delete).not.toHaveBeenCalled();

    repositoryMocks.findById.mockResolvedValue(
      baseIndent({ status: "APPROVED", lineItems: [{ id: "item-1", status: "PENDING" }] })
    );
    await IndentService.deleteIndent("indent-1", "admin-user", "workspace-1");
    expect(dbMocks.indent.delete).toHaveBeenCalledWith({ where: { id: "indent-1" } });
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

describe("Self-approval stages are cleared on submit", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    repositoryMocks.updateStatus.mockImplementation(async (_id: any, status: any, extra: any) => ({ status, ...extra }));
    dbMocks.workspaceMember.findMany.mockResolvedValue([{ userId: "manager-user" }]);
    dbMocks.workspaceMember.findFirst.mockResolvedValue({ userId: "manager-user" });
    dbMocks.notification.createMany.mockResolvedValue({ count: 1 });
    pusherTrigger.mockResolvedValue(undefined);
  });

  const draftBy = (workspaceRole: string, overrides: Record<string, any> = {}) =>
    baseIndent({
      status: "DRAFT",
      requestedBy: {
        id: "requester-member",
        reportToId: null,
        workspaceRole,
        user: { id: "requester-user", name: "Requester", surname: "One" },
      },
      ...overrides,
    });

  const submitAs = async (workspaceRole: string, overrides: Record<string, any> = {}) => {
    repositoryMocks.findWorkspaceMember.mockResolvedValue({ id: "requester-member", workspaceRole });
    repositoryMocks.findById.mockResolvedValue(draftBy(workspaceRole, overrides));
    return IndentService.submitIndent("indent-1", "requester-user", "workspace-1");
  };

  test("a member's indent still waits on manager approval", async () => {
    const updated = await submitAs("MEMBER");
    expect(updated.status).toBe("SUBMITTED");
    expect(updated.managerApprovedAt).toBeUndefined();
  });

  test("a manager's own indent skips manager approval", async () => {
    const updated = await submitAs("MANAGER");

    expect(updated.status).toBe("PENDING_OWNER_COMPARATIVE_APPROVAL");
    expect(updated.managerApprovedById).toBe("requester-member");
  });

  test("an owner's own indent goes straight to entering final rates", async () => {
    const updated = await submitAs("OWNER", { approverIds: ["requester-member"] });

    expect(updated.status).toBe("COMPARATIVES_IN_PROGRESS");
    expect(updated.approvedByIds).toEqual(["requester-member"]);
    expect(updated.ownerAuthorizedAt).toBeInstanceOf(Date);
  });

  test("an owner who picked a co-approver still waits for them", async () => {
    const updated = await submitAs("OWNER", { approverIds: ["requester-member", "other-owner"] });

    expect(updated.status).toBe("PENDING_OWNER_COMPARATIVE_APPROVAL");
  });

  test("a manager who reports to someone still needs that approval", async () => {
    repositoryMocks.findWorkspaceMember.mockResolvedValue({ id: "requester-member", workspaceRole: "MANAGER" });
    repositoryMocks.findById.mockResolvedValue(
      baseIndent({
        status: "DRAFT",
        requestedBy: {
          id: "requester-member",
          reportToId: "senior-manager",
          workspaceRole: "MANAGER",
          user: { id: "requester-user", name: "Requester", surname: "One" },
        },
      })
    );

    const updated = await IndentService.submitIndent("indent-1", "requester-user", "workspace-1");
    expect(updated.status).toBe("SUBMITTED");
  });

  test("every submit raises a notification for whoever is next", async () => {
    await submitAs("MEMBER");
    expect(dbMocks.notification.createMany).toHaveBeenCalledTimes(1);
  });
});

describe("Each cleared stage notifies the raiser", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    repositoryMocks.updateStatus.mockImplementation(async (_id: any, status: any, extra: any) => ({ status, ...extra }));
    dbMocks.workspaceMember.findMany.mockResolvedValue([{ userId: "owner-user" }]);
    dbMocks.notification.createMany.mockResolvedValue({ count: 1 });
    pusherTrigger.mockResolvedValue(undefined);
  });

  const titlesSent = () =>
    dbMocks.notification.createMany.mock.calls.flatMap((call: any) =>
      call[0].data.map((row: any) => `${row.userId}:${row.title}`)
    );

  test("manager approval tells the owners and the raiser", async () => {
    repositoryMocks.findWorkspaceMember.mockResolvedValue({ id: "manager-member", workspaceRole: "MANAGER" });
    repositoryMocks.findById.mockResolvedValue(baseIndent({ status: "SUBMITTED" }));

    await IndentService.approveIndent("indent-1", "manager-user", "workspace-1");

    expect(titlesSent()).toEqual(
      expect.arrayContaining([
        "owner-user:Get procurement comparitives",
        "requester-user:Manager approved your indent",
      ])
    );
  });

  test("final manager approval tells the owners and the raiser", async () => {
    repositoryMocks.findWorkspaceMember.mockResolvedValue({ id: "manager-member", workspaceRole: "MANAGER" });
    repositoryMocks.findById.mockResolvedValue(baseIndent({ status: "PENDING_MANAGER_FINAL_RATE_APPROVAL" }));

    await IndentService.approveIndent("indent-1", "manager-user", "workspace-1");

    expect(titlesSent()).toEqual(
      expect.arrayContaining([
        "owner-user:Final procurement approval required",
        "requester-user:Manager approved your final rates",
      ])
    );
  });
});

describe("Manager approval routing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    repositoryMocks.updateStatus.mockImplementation(async (_id: any, status: any, extra: any) => ({ status, ...extra }));
    dbMocks.workspaceMember.findMany.mockResolvedValue([]);
    dbMocks.notification.createMany.mockResolvedValue({ count: 1 });
    pusherTrigger.mockResolvedValue(undefined);
  });

  const indentFrom = (raisedInProject: boolean, overrides: Record<string, any> = {}) =>
    baseIndent({
      status: "SUBMITTED",
      raisedInProject,
      project: { id: "project-1", name: "Tower A", projectManagerId: "project-manager" },
      ...overrides,
    });

  const approveAs = async (memberId: string, indent: any) => {
    repositoryMocks.findWorkspaceMember.mockResolvedValue({ id: memberId, workspaceRole: "MANAGER" });
    repositoryMocks.findById.mockResolvedValue(indent);
    return IndentService.approveIndent("indent-1", "approver-user", "workspace-1");
  };

  test("an indent raised inside a project goes to the project manager", async () => {
    const updated = await approveAs("project-manager", indentFrom(true));
    expect(updated.status).toBe("PENDING_OWNER_COMPARATIVE_APPROVAL");
  });

  test("the reporting manager cannot approve a project-raised indent", async () => {
    await expect(approveAs("manager-member", indentFrom(true))).rejects.toThrow(
      "Only the requester's manager can approve approximate rates"
    );
  });

  test("an indent raised globally goes to the reporting manager", async () => {
    const updated = await approveAs("manager-member", indentFrom(false));
    expect(updated.status).toBe("PENDING_OWNER_COMPARATIVE_APPROVAL");
  });

  test("a project with no manager falls back to the reporting manager", async () => {
    const indent = indentFrom(true, { project: { id: "project-1", name: "Tower A", projectManagerId: null } });
    const updated = await approveAs("manager-member", indent);
    expect(updated.status).toBe("PENDING_OWNER_COMPARATIVE_APPROVAL");
  });

  test("a general indent with no project uses the reporting manager", async () => {
    const indent = indentFrom(false, { project: null, projectId: null });
    const updated = await approveAs("manager-member", indent);
    expect(updated.status).toBe("PENDING_OWNER_COMPARATIVE_APPROVAL");
    // No project channel exists to broadcast a general indent to.
    expect(broadcastProjectUpdate).not.toHaveBeenCalled();
  });
});

describe("Owners override the manager gate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    repositoryMocks.updateStatus.mockImplementation(async (_id: any, status: any, extra: any) => ({ status, ...extra }));
    dbMocks.workspaceMember.findMany.mockResolvedValue([]);
    dbMocks.notification.createMany.mockResolvedValue({ count: 1 });
    pusherTrigger.mockResolvedValue(undefined);
  });

  const assignedElsewhere = (status: string) =>
    baseIndent({
      status,
      raisedInProject: true,
      project: { id: "project-1", name: "Tower A", projectManagerId: "project-manager" },
    });

  const approveAs = async (member: { id: string; workspaceRole: string }, indent: any) => {
    repositoryMocks.findWorkspaceMember.mockResolvedValue(member);
    repositoryMocks.findById.mockResolvedValue(indent);
    return IndentService.approveIndent("indent-1", "some-user", "workspace-1");
  };

  test("an owner clearing approximate rates authorizes comparatives in one step", async () => {
    const updated = await approveAs(
      { id: "owner-member", workspaceRole: "OWNER" },
      assignedElsewhere("SUBMITTED")
    );
    // The only selected owner just signed, so there is nothing left to ask them.
    expect(updated.status).toBe("COMPARATIVES_IN_PROGRESS");
    expect(updated.approvedByIds).toEqual(["owner-member"]);
    expect(updated.ownerAuthorizedAt).toBeInstanceOf(Date);
  });

  test("co-approvers are still waited on", async () => {
    const indent = assignedElsewhere("SUBMITTED");
    indent.approverIds = ["owner-member", "second-owner"];
    const updated = await approveAs({ id: "owner-member", workspaceRole: "OWNER" }, indent);
    expect(updated.status).toBe("PENDING_OWNER_COMPARATIVE_APPROVAL");
    expect(updated.approvedByIds).toEqual(["owner-member"]);
  });

  test("an owner who is not a selected approver does not clear the owner stage", async () => {
    const updated = await approveAs(
      { id: "uninvolved-owner", workspaceRole: "OWNER" },
      assignedElsewhere("SUBMITTED")
    );
    expect(updated.status).toBe("PENDING_OWNER_COMPARATIVE_APPROVAL");
    expect(updated.approvedByIds).toEqual([]);
  });

  test("the override records the owner, not the assigned manager", async () => {
    const updated = await approveAs(
      { id: "owner-member", workspaceRole: "OWNER" },
      assignedElsewhere("SUBMITTED")
    );
    expect(updated.managerApprovedById).toBe("owner-member");
  });

  test("an owner clearing final rates approves the indent outright", async () => {
    const updated = await approveAs(
      { id: "owner-member", workspaceRole: "OWNER" },
      assignedElsewhere("PENDING_MANAGER_FINAL_RATE_APPROVAL")
    );
    expect(updated.status).toBe("APPROVED");
    expect(updated.finalManagerApprovedById).toBe("owner-member");
    expect(updated.finalOwnerApprovedByIds).toEqual(["owner-member"]);
  });

  test("a manager clearing final rates still needs the owner", async () => {
    const updated = await approveAs(
      { id: "project-manager", workspaceRole: "MANAGER" },
      assignedElsewhere("PENDING_MANAGER_FINAL_RATE_APPROVAL")
    );
    expect(updated.status).toBe("PENDING_OWNER_FINAL_APPROVAL");
    expect(updated.finalOwnerApprovedByIds).toEqual([]);
  });

  test("an admin still cannot stand in for the assigned manager", async () => {
    await expect(
      approveAs({ id: "admin-member", workspaceRole: "ADMIN" }, assignedElsewhere("SUBMITTED"))
    ).rejects.toThrow("Only the requester's manager can approve approximate rates");
  });

  test("a different manager still cannot", async () => {
    await expect(
      approveAs({ id: "manager-member", workspaceRole: "MANAGER" }, assignedElsewhere("SUBMITTED"))
    ).rejects.toThrow("Only the requester's manager can approve approximate rates");
  });
});

describe("Standing in for the requester on final rates", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dbMocks.workspaceMember.findMany.mockResolvedValue([]);
    dbMocks.notification.createMany.mockResolvedValue({ count: 1 });
    pusherTrigger.mockResolvedValue(undefined);
    dbMocks.indent.update.mockImplementation(async ({ data }: any) => ({ ...data }));
    dbMocks.indentLineItem.update.mockResolvedValue({});
  });

  const readyForFinalRates = () =>
    baseIndent({
      status: "COMPARATIVES_IN_PROGRESS",
      requestedById: "requester-member",
      approverIds: ["owner-member"],
      approvedByIds: ["owner-member"],
      raisedInProject: true,
      project: { id: "project-1", name: "Tower A", projectManagerId: "project-manager" },
      lineItems: [{ id: "item-1", materialName: "Cement", quantity: 10 }],
    });

  const submitAs = async (member: { id: string; workspaceRole: string }) => {
    repositoryMocks.findWorkspaceMember.mockResolvedValue(member);
    repositoryMocks.findById.mockResolvedValue(readyForFinalRates());
    return IndentService.submitFinalRates(
      "indent-1",
      [{ itemId: "item-1", finalUnitPrice: 45000 }],
      undefined,
      "some-user",
      "workspace-1"
    );
  };

  test("the requester enters them as before", async () => {
    const updated = await submitAs({ id: "requester-member", workspaceRole: "MEMBER" });
    expect(updated.status).toBe("PENDING_MANAGER_FINAL_RATE_APPROVAL");
    expect(updated.finalRatesSubmittedById).toBe("requester-member");
  });

  test("the assigned manager can stand in", async () => {
    const updated = await submitAs({ id: "project-manager", workspaceRole: "MANAGER" });
    expect(updated.status).toBe("PENDING_MANAGER_FINAL_RATE_APPROVAL");
    expect(updated.finalRatesSubmittedById).toBe("project-manager");
  });

  test("an owner can stand in", async () => {
    const updated = await submitAs({ id: "owner-member", workspaceRole: "OWNER" });
    expect(updated.finalRatesSubmittedById).toBe("owner-member");
  });

  test("anyone else is still refused", async () => {
    await expect(submitAs({ id: "someone-else", workspaceRole: "MEMBER" })).rejects.toThrow(
      "Only the requester, their manager or an owner can enter final rates"
    );
  });
});

describe("General indents", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    repositoryMocks.findWorkspaceMember.mockResolvedValue({ id: "requester-member", workspaceRole: "MEMBER" });
    dbMocks.workspaceMember.count.mockResolvedValue(1);
    repositoryMocks.create.mockImplementation(async (data: any) => data);
  });

  const payload = (overrides: Record<string, any> = {}) => ({
    projectId: undefined,
    workspaceId: "workspace-1",
    approverIds: ["owner-member"],
    lineItems: [{ materialName: "Cement", quantity: 10, unit: "bag", estimatedUnitPrice: 40000 }],
    ...overrides,
  });

  test("can be raised with no project and is named General", async () => {
    const created: any = await IndentService.createIndent(payload() as any, "requester-user");

    expect(dbMocks.project.findFirst).not.toHaveBeenCalled();
    expect(created.projectId).toBeUndefined();
    expect(created.name).toContain("General - Cement");
  });

  test("cannot be linked to a task", async () => {
    await expect(
      IndentService.createIndent(payload({ taskId: "task-1" }) as any, "requester-user")
    ).rejects.toThrow("A general indent cannot be linked to a task");
  });

  test("a project-backed indent still validates the project", async () => {
    dbMocks.project.findFirst.mockResolvedValue(null);

    await expect(
      IndentService.createIndent(payload({ projectId: "missing" }) as any, "requester-user")
    ).rejects.toThrow("Project not found in this workspace");
  });
});
