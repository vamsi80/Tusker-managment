import { beforeEach, describe, expect, test, vi } from "vitest";

const dbMocks = vi.hoisted(() => ({
  indent: {
    findFirst: vi.fn(),
    findUnique: vi.fn(),
    updateMany: vi.fn(),
  },
}));

vi.mock("@/lib/db", () => ({ default: dbMocks }));
vi.mock("../../material-catalog.service", () => ({ ensureMaterialCatalog: vi.fn() }));

import { IndentRepository } from "../indent.repository";

describe("IndentRepository workspace and approval safeguards", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("task lookup is scoped to the requested workspace", async () => {
    dbMocks.indent.findFirst.mockResolvedValue(null);

    await IndentRepository.findByTaskId("task-1", "workspace-1");

    expect(dbMocks.indent.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { taskId: "task-1", workspaceId: "workspace-1" },
      })
    );
  });

  test("retries an owner approval instead of overwriting a concurrent approval", async () => {
    dbMocks.indent.findUnique
      // First read races with another owner's successful update.
      .mockResolvedValueOnce({
        status: "PENDING_OWNER_COMPARATIVE_APPROVAL",
        approverIds: ["owner-a", "owner-b"],
        approvedByIds: [],
        finalOwnerApprovedByIds: [],
      })
      // Retry sees owner A and appends owner B to that newer snapshot.
      .mockResolvedValueOnce({
        status: "PENDING_OWNER_COMPARATIVE_APPROVAL",
        approverIds: ["owner-a", "owner-b"],
        approvedByIds: ["owner-a"],
        finalOwnerApprovedByIds: [],
      })
      .mockResolvedValueOnce({
        id: "indent-1",
        status: "COMPARATIVES_IN_PROGRESS",
        approvedByIds: ["owner-a", "owner-b"],
      });
    dbMocks.indent.updateMany
      .mockResolvedValueOnce({ count: 0 })
      .mockResolvedValueOnce({ count: 1 });

    const result = await IndentRepository.recordOwnerApproval(
      "indent-1",
      "owner-b",
      "COMPARATIVE"
    );

    expect(dbMocks.indent.updateMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          approvedByIds: { equals: ["owner-a"] },
        }),
        data: expect.objectContaining({
          status: "COMPARATIVES_IN_PROGRESS",
          approvedByIds: ["owner-a", "owner-b"],
        }),
      })
    );
    expect(result).toEqual({
      updated: expect.objectContaining({ status: "COMPARATIVES_IN_PROGRESS" }),
      allApproved: true,
    });
  });

  test("accepts the legacy owner-approval status without losing the approval", async () => {
    dbMocks.indent.findUnique
      .mockResolvedValueOnce({
        status: "PENDING_OWNER_APPROVAL",
        approverIds: ["owner-a"],
        approvedByIds: [],
        finalOwnerApprovedByIds: [],
      })
      .mockResolvedValueOnce({
        id: "indent-1",
        status: "COMPARATIVES_IN_PROGRESS",
        approvedByIds: ["owner-a"],
      });
    dbMocks.indent.updateMany.mockResolvedValueOnce({ count: 1 });

    await IndentRepository.recordOwnerApproval("indent-1", "owner-a", "COMPARATIVE");

    expect(dbMocks.indent.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: "PENDING_OWNER_APPROVAL" }),
        data: expect.objectContaining({
          status: "COMPARATIVES_IN_PROGRESS",
          approvedByIds: ["owner-a"],
        }),
      })
    );
  });
});
