import { describe, it, expect, vi, beforeEach } from "vitest";
import { BoardService } from "../board.service";
import { fetchWorkspacePermissions } from "../../../../permissions";
import prisma from "@tusker/db";

vi.mock("../../../../permissions", () => ({
    fetchWorkspacePermissions: vi.fn(),
    fetchUserPermissions: vi.fn(),
}));

describe("BoardService", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    const validWorkspaceId = "w_123";
    const validItemId = "b_123";
    const asPerms = (perms: Record<string, unknown>) =>
        (fetchWorkspacePermissions as any).mockResolvedValue(perms);

    describe("createBoardItem", () => {
        it("should allow admin to create a note for any member", async () => {
            asPerms({ isWorkspaceAdmin: true, workspaceMemberId: "wm_admin" });
            (prisma.board.create as any).mockResolvedValue({ id: "b_1" });

            const result = await BoardService.createBoardItem(
                "admin_user", validWorkspaceId, "wm_target", "Admin note"
            );

            expect(result.status).toBe("success");
            expect(prisma.board.create).toHaveBeenCalled();
        });

        it("should prevent members from adding notes to others' boards", async () => {
            asPerms({ isWorkspaceAdmin: false, workspaceMemberId: "wm_member" });

            const result = await BoardService.createBoardItem(
                "member_user", validWorkspaceId, "wm_other", "Member note"
            );

            expect(result.status).toBe("error");
            expect(result.message).toContain("Unauthorized");
            expect(prisma.board.create).not.toHaveBeenCalled();
        });
    });

    describe("deleteBoardItem", () => {
        it("should prevent members from deleting notes created by admins", async () => {
            asPerms({ isWorkspaceAdmin: false, workspaceMemberId: "wm_member" });

            // Item created by an OWNER
            (prisma.board.findUnique as any).mockResolvedValue({
                id: validItemId,
                assignedById: "wm_admin",
                memberId: "wm_member",
                assignedBy: { workspaceRole: "OWNER" },
            });

            const result = await BoardService.deleteBoardItem("member_user", validWorkspaceId, validItemId);

            expect(result.status).toBe("error");
            expect(result.message).toContain("cannot delete notes created by an Admin");
            expect(prisma.board.delete).not.toHaveBeenCalled();
        });

        it("should allow members to delete their own self-created notes", async () => {
            asPerms({ isWorkspaceAdmin: false, workspaceMemberId: "wm_member" });

            (prisma.board.findUnique as any).mockResolvedValue({
                id: validItemId,
                assignedById: "wm_member",
                memberId: "wm_member",
                assignedBy: { workspaceRole: "MEMBER" },
            });

            const result = await BoardService.deleteBoardItem("member_user", validWorkspaceId, validItemId);

            expect(result.status).toBe("success");
            expect(prisma.board.delete).toHaveBeenCalled();
        });
    });
});
