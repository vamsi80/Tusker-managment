import { describe, it, expect, vi, beforeEach } from "vitest";
import { TagService } from "../tag.service";
import { fetchWorkspacePermissions } from "../../../../permissions";
import prisma from "@tusker/db";

vi.mock("../../../../permissions", () => ({
    fetchWorkspacePermissions: vi.fn(),
    fetchUserPermissions: vi.fn(),
}));

vi.mock("../../../../lib/cache/invalidation", () => ({
    invalidateWorkspaceTags: vi.fn(),
}));

describe("TagService", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    const userId = "admin_user";
    const validWorkspaceId = "846e17c7-d85f-4453-9ca0-0acc7bfce49c";
    const validTagId = "846e17c7-d85f-4453-9ca0-0acc7bfce49d";
    const asAdmin = (isWorkspaceAdmin: boolean) =>
        (fetchWorkspacePermissions as any).mockResolvedValue({ isWorkspaceAdmin });

    describe("createTag", () => {
        it("should successfully create a tag if user is admin", async () => {
            asAdmin(true);
            (prisma.tag.findFirst as any).mockResolvedValue(null);
            (prisma.tag.create as any).mockResolvedValue({ id: validTagId, name: "Urgent" });

            const result = await TagService.createTag(userId, {
                workspaceId: validWorkspaceId,
                name: "Urgent",
                requirePurchase: false,
            });

            expect(result.success).toBe(true);
            expect(prisma.tag.create).toHaveBeenCalled();
        });

        it("should fail if tag name already exists", async () => {
            asAdmin(true);
            (prisma.tag.findFirst as any).mockResolvedValue({ id: validTagId, name: "Duplicate" });

            const result = await TagService.createTag(userId, {
                workspaceId: validWorkspaceId,
                name: "Duplicate",
                requirePurchase: false,
            });

            expect(result.success).toBe(false);
            expect((result as any).error).toContain("already exists");
        });

        // A name clash is only a conflict at workspace level; adding an existing
        // tag to a project should attach it rather than fail.
        it("connects an existing workspace tag when a projectId is given", async () => {
            asAdmin(true);
            (prisma.tag.findFirst as any).mockResolvedValue({ id: validTagId, name: "Shared" });

            const result = await TagService.createTag(userId, {
                workspaceId: validWorkspaceId,
                name: "Shared",
                requirePurchase: false,
                projectId: "project_1",
            });

            expect(result.success).toBe(true);
            expect(prisma.project.update).toHaveBeenCalled();
            expect(prisma.tag.create).not.toHaveBeenCalled();
        });
    });

    describe("updateTag", () => {
        it("should successfully update a tag", async () => {
            asAdmin(true);
            (prisma.tag.findFirst as any).mockResolvedValue(null);
            (prisma.tag.update as any).mockResolvedValue({ id: validTagId, name: "Updated" });

            const result = await TagService.updateTag(userId, {
                tagId: validTagId,
                workspaceId: validWorkspaceId,
                name: "Updated",
                requirePurchase: true,
            });

            expect(result.success).toBe(true);
            expect(prisma.tag.update).toHaveBeenCalled();
        });
    });

    describe("deleteTag", () => {
        it("should successfully delete a tag", async () => {
            asAdmin(true);

            const result = await TagService.deleteTag(userId, {
                tagId: validTagId,
                workspaceId: validWorkspaceId,
            });

            expect(result.success).toBe(true);
            expect(prisma.tag.delete).toHaveBeenCalled();
        });

        it("should fail if user is not an admin", async () => {
            asAdmin(false);

            const result = await TagService.deleteTag(userId, {
                tagId: validTagId,
                workspaceId: validWorkspaceId,
            });

            expect(result.success).toBe(false);
            expect((result as any).error).toContain("don't have permission");
            expect(prisma.tag.delete).not.toHaveBeenCalled();
        });
    });
});
