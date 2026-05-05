import { describe, it, expect, vi, beforeEach } from "vitest";
import { TasksService } from "@/server/services/task/tasks.service";
import { requireUser } from "@/lib/auth/require-user";
import { getUserPermissions } from "@/data/user/get-user-permissions";
import prisma from "@/lib/db";

describe("Task Actions", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    const validWorkspaceId = "846e17c7-d85f-4453-9ca0-0acc7bfce49c";
    const validProjectId = "846e17c7-d85f-4453-9ca0-0acc7bfce49d";

    describe("bulkUploadTasksAndSubtasks", () => {
        const bulkData = {
            projectId: validProjectId,
            tasks: [
                {
                    taskName: "Parent Task 1",
                    subtaskName: "Subtask A",
                    assigneeEmail: "member@example.com",
                    startDate: "2024-12-01",
                    days: 5,
                }
            ]
        };

        it("should fail if no tasks are provided", async () => {
            await expect(TasksService.bulkUploadTasksAndSubtasks({ projectId: validProjectId, tasks: [], userId: "user_admin" }))
                .rejects.toThrow("No tasks provided");
        });

        it("should successfully bulk upload if user has permission", async () => {
            (requireUser as any).mockResolvedValue({ id: "user_admin", email: "admin@example.com" });
            (prisma.project.findUnique as any).mockResolvedValue({ workspaceId: validWorkspaceId });
            (getUserPermissions as any).mockResolvedValue({
                workspaceMember: { id: "wm_admin" },
                projectMember: { id: "pm_admin" },
                isProjectManager: true
            });
            (prisma.projectMember.findMany as any).mockResolvedValue([
                { id: "pm_admin", workspaceMember: { user: { email: "admin@example.com", id: "user_admin" } } },
                { id: "pm_member", workspaceMember: { user: { email: "member@example.com", id: "user_member" } } }
            ]);
            (prisma.tag.findMany as any).mockResolvedValue([]);

            const result = await TasksService.bulkUploadTasksAndSubtasks({ ...bulkData, userId: "user_admin" });

            expect(result.success).toBe(true);
            expect(result.message).toContain("Successfully created 1 task");
            expect(prisma.$transaction).toHaveBeenCalled();
        });

        it("should fail if assignee email is not in project", async () => {
            (requireUser as any).mockResolvedValue({ id: "user_admin", email: "admin@example.com" });
            (prisma.project.findUnique as any).mockResolvedValue({ workspaceId: validWorkspaceId });
            (getUserPermissions as any).mockResolvedValue({
                workspaceMember: { id: "wm_admin" },
                projectMember: { id: "pm_admin" },
                isProjectManager: true
            });
            (prisma.projectMember.findMany as any).mockResolvedValue([
                // member@example.com is MISSING
                { id: "pm_admin", workspaceMember: { user: { email: "admin@example.com", id: "user_admin" } } }
            ]);

            await expect(TasksService.bulkUploadTasksAndSubtasks({ ...bulkData, userId: "user_admin" }))
                .rejects.toThrow("not members of this project");
        });

        it("should fail if date format is invalid", async () => {
            (requireUser as any).mockResolvedValue({ id: "user_admin", email: "admin@example.com" });
            (prisma.project.findUnique as any).mockResolvedValue({ workspaceId: validWorkspaceId });
            (getUserPermissions as any).mockResolvedValue({
                workspaceMember: { id: "wm_admin" },
                projectMember: { id: "pm_admin" },
                isProjectManager: true
            });
            (prisma.projectMember.findMany as any).mockResolvedValue([
                { id: "pm_admin", workspaceMember: { user: { email: "admin@example.com", id: "user_admin" } } },
                { id: "pm_member", workspaceMember: { user: { email: "member@example.com", id: "user_member" } } }
            ]);

            await expect(TasksService.bulkUploadTasksAndSubtasks({
                ...bulkData,
                tasks: [{ ...bulkData.tasks[0], startDate: "invalid-date" }],
                userId: "user_admin"
            })).rejects.toThrow("Invalid date format");
        });

        it("should fail if days value is negative", async () => {
            (requireUser as any).mockResolvedValue({ id: "user_admin", email: "admin@example.com" });
            (prisma.project.findUnique as any).mockResolvedValue({ workspaceId: validWorkspaceId });
            (getUserPermissions as any).mockResolvedValue({
                workspaceMember: { id: "wm_admin" },
                projectMember: { id: "pm_admin" },
                isProjectManager: true
            });
            (prisma.projectMember.findMany as any).mockResolvedValue([
                { id: "pm_admin", workspaceMember: { user: { email: "admin@example.com", id: "user_admin" } } },
                { id: "pm_member", workspaceMember: { user: { email: "member@example.com", id: "user_member" } } }
            ]);

            await expect(TasksService.bulkUploadTasksAndSubtasks({
                ...bulkData,
                tasks: [{ ...bulkData.tasks[0], days: -5 }],
                userId: "user_admin"
            })).rejects.toThrow("Invalid days value");
        });
    });
});
