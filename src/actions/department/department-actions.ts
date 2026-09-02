"use server";

import { z } from "zod";

import prisma from "@/lib/db";
import { getSession } from "@/lib/auth/require-user";
import { getWorkspacePermissions } from "@/data/user/get-user-permissions";
import { invalidateWorkspaceDepartments } from "@/lib/cache/invalidation";
import { timeString } from "@/lib/zodSchemas";

const departmentSchema = z.object({
    id: z.string().optional(),
    name: z.string().min(1, "Department name is required").max(60, "Department name must be less than 60 characters"),
    shiftScheduleId: z.string().optional().nullable().or(z.literal("")),
    workspaceId: z.string(),
});

const shiftScheduleSchema = z.object({
    id: z.string(),
    workspaceId: z.string(),
    lateThreshold: timeString,
    halfDayThreshold: timeString,
    shiftStartTime: timeString,
    shiftEndTime: timeString,
    overtimeThreshold: timeString,
});

/** Admin gate shared by every action here. Returns an error object, never throws. */
async function requireAdmin(workspaceId: string, verb: string) {
    const session = await getSession();
    if (!session) return { success: false as const, error: "Unauthorized" };

    const permissions = await getWorkspacePermissions(workspaceId);
    if (!permissions.isWorkspaceAdmin) {
        return { success: false as const, error: `You don't have permission to ${verb}` };
    }
    return null;
}

function zodError(error: unknown, fallback: string) {
    if (error instanceof z.ZodError) {
        return { success: false as const, error: error.issues[0].message };
    }
    return { success: false as const, error: fallback };
}

/**
 * Department options for the member invite/edit pickers. Any member of the
 * workspace may read them; only admins can change them.
 */
export async function listDepartments(workspaceId: string) {
    try {
        const session = await getSession();
        if (!session) return { success: false as const, error: "Unauthorized", data: [] as { id: string; name: string }[] };

        // Membership is the gate here, not project access — hasAccess is false for
        // a member who happens to be on no projects, and they still need the list.
        const permissions = await getWorkspacePermissions(workspaceId, undefined, true);
        if (!permissions.workspaceMemberId) {
            return { success: false as const, error: "Not a member of this workspace", data: [] as { id: string; name: string }[] };
        }

        const departments = await prisma.department.findMany({
            where: { workspaceId },
            select: { id: true, name: true },
            orderBy: { name: "asc" },
        });

        return { success: true as const, data: departments };
    } catch (error) {
        console.error("Error listing departments:", error);
        return { success: false as const, error: "Failed to load departments", data: [] as { id: string; name: string }[] };
    }
}

export async function createDepartment(data: z.infer<typeof departmentSchema>) {
    try {
        const validated = departmentSchema.parse(data);
        const denied = await requireAdmin(validated.workspaceId, "create departments");
        if (denied) return denied;

        const exists = await prisma.department.findFirst({
            where: {
                workspaceId: validated.workspaceId,
                name: { equals: validated.name, mode: "insensitive" },
            },
        });
        if (exists) return { success: false as const, error: "A department with this name already exists" };

        const department = await prisma.department.create({
            data: {
                name: validated.name,
                workspaceId: validated.workspaceId,
                shiftScheduleId: validated.shiftScheduleId || null,
            },
        });

        await invalidateWorkspaceDepartments(validated.workspaceId);
        return { success: true as const, data: department };
    } catch (error) {
        console.error("Error creating department:", error);
        return zodError(error, "Failed to create department");
    }
}

export async function updateDepartment(data: z.infer<typeof departmentSchema>) {
    try {
        const validated = departmentSchema.parse(data);
        if (!validated.id) return { success: false as const, error: "Department ID is required" };

        const denied = await requireAdmin(validated.workspaceId, "update departments");
        if (denied) return denied;

        // Scope the lookup by workspace so an id from another workspace cannot be edited.
        const existing = await prisma.department.findFirst({
            where: { id: validated.id, workspaceId: validated.workspaceId },
        });
        if (!existing) return { success: false as const, error: "Department not found" };

        const duplicate = await prisma.department.findFirst({
            where: {
                workspaceId: validated.workspaceId,
                name: { equals: validated.name, mode: "insensitive" },
                id: { not: validated.id },
            },
        });
        if (duplicate) return { success: false as const, error: "A department with this name already exists" };

        const department = await prisma.department.update({
            where: { id: validated.id },
            data: {
                name: validated.name,
                shiftScheduleId: validated.shiftScheduleId || null,
            },
        });

        await invalidateWorkspaceDepartments(validated.workspaceId);
        return { success: true as const, data: department };
    } catch (error) {
        console.error("Error updating department:", error);
        return zodError(error, "Failed to update department");
    }
}

export async function deleteDepartment(data: { id: string; workspaceId: string }) {
    try {
        const denied = await requireAdmin(data.workspaceId, "delete departments");
        if (denied) return denied;

        const existing = await prisma.department.findFirst({
            where: { id: data.id, workspaceId: data.workspaceId },
        });
        if (!existing) return { success: false as const, error: "Department not found" };

        // Members are detached, never deleted (FK is ON DELETE SET NULL); they fall
        // back to the workspace-wide timings until reassigned.
        await prisma.department.delete({ where: { id: data.id } });

        await invalidateWorkspaceDepartments(data.workspaceId);
        return { success: true as const };
    } catch (error) {
        console.error("Error deleting department:", error);
        return zodError(error, "Failed to delete department");
    }
}

export async function updateShiftSchedule(data: z.infer<typeof shiftScheduleSchema>) {
    try {
        const validated = shiftScheduleSchema.parse(data);
        const denied = await requireAdmin(validated.workspaceId, "update shift timings");
        if (denied) return denied;

        const existing = await prisma.shiftSchedule.findFirst({
            where: { id: validated.id, workspaceId: validated.workspaceId },
        });
        if (!existing) return { success: false as const, error: "Shift schedule not found" };

        const schedule = await prisma.shiftSchedule.update({
            where: { id: validated.id },
            data: {
                lateThreshold: validated.lateThreshold,
                halfDayThreshold: validated.halfDayThreshold,
                shiftStartTime: validated.shiftStartTime,
                shiftEndTime: validated.shiftEndTime,
                overtimeThreshold: validated.overtimeThreshold,
            },
        });

        await invalidateWorkspaceDepartments(validated.workspaceId);
        return { success: true as const, data: schedule };
    } catch (error) {
        console.error("Error updating shift schedule:", error);
        return zodError(error, "Failed to update shift schedule");
    }
}
