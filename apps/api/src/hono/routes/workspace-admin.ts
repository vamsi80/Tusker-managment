import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "../validator";
import { HonoVariables } from "../types";
import prisma from "@tusker/db";
import { AppError } from "@tusker/core/lib/errors/app-error";
import { fetchWorkspacePermissions } from "@tusker/core/permissions";
import { timeString } from "@tusker/core/lib/zodSchemas";
import {
    invalidateWorkspace,
    invalidateWorkspaceDepartments,
    invalidateWorkspaceMembers,
} from "@tusker/core/lib/cache/invalidation";
import {
    CAPABILITIES,
    WORKSPACE_ROLES,
    coerceMemberOverrides,
    coerceRoleOverrides,
    type Capability,
} from "@tusker/core/lib/constants/capabilities";

/**
 * Workspace administration that the web reaches through Server Actions and RSC
 * loaders (apps/web/src/actions/department, actions/permissions, data/audit,
 * data/attendance). The native app cannot call those, so the same reads and
 * writes are exposed here with the same gates.
 */
const workspaceAdmin = new Hono<{ Variables: HonoVariables }>();

const requireMember = async (workspaceId: string, userId: string) => {
    const perms = await fetchWorkspacePermissions(workspaceId, userId, true);
    if (!perms.workspaceMemberId) throw AppError.Forbidden("Not a member of this workspace");
    return perms;
};

const requireAdmin = async (workspaceId: string, userId: string, verb: string) => {
    const perms = await requireMember(workspaceId, userId);
    if (!perms.isWorkspaceAdmin) throw AppError.Forbidden(`You don't have permission to ${verb}`);
    return perms;
};

// ─── Departments & shift schedules ──────────────────────────────────────────

const departmentSchema = z.object({
    name: z.string().trim().min(1, "Department name is required").max(60, "Department name must be less than 60 characters"),
    shiftScheduleId: z.string().optional().nullable().or(z.literal("")),
});

const shiftScheduleSchema = z.object({
    lateThreshold: timeString,
    halfDayThreshold: timeString,
    shiftStartTime: timeString,
    shiftEndTime: timeString,
    overtimeThreshold: timeString,
});

/** Departments with their shift schedule, member count and members (data/department/get-departments.ts). */
workspaceAdmin.get("/:workspaceId/departments", async (c) => {
    const workspaceId = c.req.param("workspaceId");
    await requireMember(workspaceId, c.get("user").id);

    const departments = await prisma.department.findMany({
        where: { workspaceId },
        select: {
            id: true,
            name: true,
            shiftScheduleId: true,
            shiftSchedule: { select: { id: true, name: true } },
            _count: { select: { members: true } },
            members: {
                select: {
                    id: true,
                    designation: true,
                    workspaceRole: true,
                    user: { select: { id: true, name: true, surname: true, email: true, image: true } },
                },
            },
        },
        orderBy: { name: "asc" },
    });

    return c.json({ success: true, data: departments });
});

workspaceAdmin.get("/:workspaceId/shift-schedules", async (c) => {
    const workspaceId = c.req.param("workspaceId");
    await requireMember(workspaceId, c.get("user").id);

    const schedules = await prisma.shiftSchedule.findMany({
        where: { workspaceId },
        select: {
            id: true,
            name: true,
            lateThreshold: true,
            halfDayThreshold: true,
            shiftStartTime: true,
            shiftEndTime: true,
            overtimeThreshold: true,
            _count: { select: { departments: true } },
        },
        orderBy: { createdAt: "asc" },
    });

    return c.json({ success: true, data: schedules });
});

workspaceAdmin.post("/:workspaceId/departments", zValidator("json", departmentSchema), async (c) => {
    const workspaceId = c.req.param("workspaceId");
    await requireAdmin(workspaceId, c.get("user").id, "create departments");
    const { name, shiftScheduleId } = c.req.valid("json");

    const exists = await prisma.department.findFirst({
        where: { workspaceId, name: { equals: name, mode: "insensitive" } },
    });
    if (exists) throw AppError.Conflict("A department with this name already exists");

    const department = await prisma.department.create({
        data: { name, workspaceId, shiftScheduleId: shiftScheduleId || null },
    });

    await invalidateWorkspaceDepartments(workspaceId);
    return c.json({ success: true, data: department }, 201);
});

workspaceAdmin.patch("/:workspaceId/departments/:id", zValidator("json", departmentSchema), async (c) => {
    const { workspaceId, id } = c.req.param();
    await requireAdmin(workspaceId, c.get("user").id, "update departments");
    const { name, shiftScheduleId } = c.req.valid("json");

    const existing = await prisma.department.findFirst({ where: { id, workspaceId } });
    if (!existing) throw AppError.NotFound("Department not found");

    const duplicate = await prisma.department.findFirst({
        where: { workspaceId, name: { equals: name, mode: "insensitive" }, id: { not: id } },
    });
    if (duplicate) throw AppError.Conflict("A department with this name already exists");

    const department = await prisma.department.update({
        where: { id },
        data: { name, shiftScheduleId: shiftScheduleId || null },
    });

    await invalidateWorkspaceDepartments(workspaceId);
    return c.json({ success: true, data: department });
});

workspaceAdmin.delete("/:workspaceId/departments/:id", async (c) => {
    const { workspaceId, id } = c.req.param();
    await requireAdmin(workspaceId, c.get("user").id, "delete departments");

    const existing = await prisma.department.findFirst({ where: { id, workspaceId } });
    if (!existing) throw AppError.NotFound("Department not found");

    // Members are detached, never deleted (FK is ON DELETE SET NULL).
    await prisma.department.delete({ where: { id } });

    await invalidateWorkspaceDepartments(workspaceId);
    return c.json({ success: true });
});

workspaceAdmin.patch("/:workspaceId/shift-schedules/:id", zValidator("json", shiftScheduleSchema), async (c) => {
    const { workspaceId, id } = c.req.param();
    await requireAdmin(workspaceId, c.get("user").id, "update shift timings");

    const existing = await prisma.shiftSchedule.findFirst({ where: { id, workspaceId } });
    if (!existing) throw AppError.NotFound("Shift schedule not found");

    const schedule = await prisma.shiftSchedule.update({ where: { id }, data: c.req.valid("json") });

    await invalidateWorkspaceDepartments(workspaceId);
    return c.json({ success: true, data: schedule });
});

// ─── Permissions grid (settings/permissions) ────────────────────────────────

const capabilityId = z.enum(CAPABILITIES.map((cap) => cap.id) as [Capability, ...Capability[]]);

const requirePermissionAdmin = async (workspaceId: string, userId: string) => {
    const perms = await requireMember(workspaceId, userId);
    if (perms.workspaceRole !== "OWNER" && perms.workspaceRole !== "ADMIN") {
        throw AppError.Forbidden("Only workspace owners and admins can change permissions");
    }
    return perms.workspaceRole as "OWNER" | "ADMIN";
};

workspaceAdmin.get("/:workspaceId/permissions", async (c) => {
    const workspaceId = c.req.param("workspaceId");
    const viewerRole = await requirePermissionAdmin(workspaceId, c.get("user").id);

    const [workspace, members] = await Promise.all([
        prisma.workspace.findUnique({ where: { id: workspaceId }, select: { permissionOverrides: true } }),
        prisma.workspaceMember.findMany({
            where: { workspaceId },
            select: {
                id: true,
                workspaceRole: true,
                designation: true,
                permissionOverrides: true,
                user: { select: { name: true, surname: true, email: true } },
            },
            orderBy: [{ workspaceRole: "asc" }, { createdAt: "asc" }],
        }),
    ]);
    if (!workspace) throw AppError.NotFound("Workspace not found");

    return c.json({
        success: true,
        data: {
            viewerRole,
            capabilities: CAPABILITIES,
            roles: WORKSPACE_ROLES,
            roleOverrides: coerceRoleOverrides(workspace.permissionOverrides),
            members: members.map((m) => ({
                id: m.id,
                role: m.workspaceRole,
                designation: m.designation,
                name: m.user?.surname || m.user?.name || m.user?.email || "Unknown",
                email: m.user?.email ?? null,
                overrides: coerceMemberOverrides(m.permissionOverrides),
            })),
        },
    });
});

workspaceAdmin.patch(
    "/:workspaceId/permissions/role",
    zValidator("json", z.object({
        role: z.enum(WORKSPACE_ROLES as [string, ...string[]]),
        capability: capabilityId,
        value: z.boolean().nullable(),
    })),
    async (c) => {
        const workspaceId = c.req.param("workspaceId");
        const viewerRole = await requirePermissionAdmin(workspaceId, c.get("user").id);
        const { role, capability, value } = c.req.valid("json");

        if (role === "OWNER") throw AppError.ValidationError("The Owner role cannot be restricted");
        if (role === "ADMIN" && viewerRole === "ADMIN") {
            throw AppError.Forbidden("Admins cannot change Admin permissions");
        }

        const workspace = await prisma.workspace.findUnique({
            where: { id: workspaceId },
            select: { permissionOverrides: true },
        });
        if (!workspace) throw AppError.NotFound("Workspace not found");

        const overrides = coerceRoleOverrides(workspace.permissionOverrides);
        const forRole = { ...(overrides[role as keyof typeof overrides] ?? {}) };
        if (value === null) delete forRole[capability];
        else forRole[capability] = value;

        const next = { ...overrides, [role]: forRole };
        if (Object.keys(forRole).length === 0) delete (next as Record<string, unknown>)[role];

        await prisma.workspace.update({ where: { id: workspaceId }, data: { permissionOverrides: next } });
        await invalidateWorkspace(workspaceId);
        await invalidateWorkspaceMembers(workspaceId);

        return c.json({ success: true, data: next });
    }
);

workspaceAdmin.patch(
    "/:workspaceId/permissions/member",
    zValidator("json", z.object({
        workspaceMemberId: z.string().min(1),
        capability: capabilityId,
        value: z.boolean().nullable(),
    })),
    async (c) => {
        const workspaceId = c.req.param("workspaceId");
        const viewerRole = await requirePermissionAdmin(workspaceId, c.get("user").id);
        const { workspaceMemberId, capability, value } = c.req.valid("json");

        const member = await prisma.workspaceMember.findFirst({
            where: { id: workspaceMemberId, workspaceId },
            select: { id: true, workspaceRole: true, permissionOverrides: true },
        });
        if (!member) throw AppError.NotFound("Member not found");
        if (member.workspaceRole === "OWNER") throw AppError.ValidationError("The workspace owner cannot be restricted");
        if (member.workspaceRole === "ADMIN" && viewerRole === "ADMIN") {
            throw AppError.Forbidden("Admins cannot restrict other admins");
        }

        const overrides = coerceMemberOverrides(member.permissionOverrides);
        if (value === null) delete overrides[capability];
        else overrides[capability] = value;

        await prisma.workspaceMember.update({ where: { id: member.id }, data: { permissionOverrides: overrides } });
        await invalidateWorkspaceMembers(workspaceId);

        return c.json({ success: true, data: overrides });
    }
);

// ─── Activity log (settings/activity) ───────────────────────────────────────

workspaceAdmin.get("/:workspaceId/activity", async (c) => {
    const workspaceId = c.req.param("workspaceId");
    await requireAdmin(workspaceId, c.get("user").id, "view activity logs");

    const logs = await prisma.auditLog.findMany({
        where: { workspaceId },
        select: {
            id: true,
            action: true,
            entityType: true,
            entityId: true,
            user: { select: { name: true, surname: true, email: true, image: true } },
            createdAt: true,
        },
        orderBy: { createdAt: "desc" },
        take: 100,
    });

    return c.json({ success: true, data: logs });
});

// ─── Attendance settings (team/settings) ────────────────────────────────────

workspaceAdmin.get("/:workspaceId/attendance-settings", async (c) => {
    const workspaceId = c.req.param("workspaceId");
    await requireAdmin(workspaceId, c.get("user").id, "manage attendance settings");

    const [workspace, publicHolidays, attendanceLocations] = await Promise.all([
        prisma.workspace.findUnique({
            where: { id: workspaceId },
            select: {
                lateThreshold: true,
                overtimeThreshold: true,
                halfDayThreshold: true,
                shiftStartTime: true,
                shiftEndTime: true,
                sickLeaveLimit: true,
                casualLeaveAccrualDays: true,
                pointsResetPeriod: true,
            },
        }),
        prisma.public_holiday.findMany({ where: { workspaceId }, orderBy: { date: "asc" } }),
        prisma.attendanceLocation.findMany({ where: { workspaceId } }),
    ]);
    if (!workspace) throw AppError.NotFound("Workspace not found");

    return c.json({ success: true, data: { ...workspace, publicHolidays, attendanceLocations } });
});

export default workspaceAdmin;
