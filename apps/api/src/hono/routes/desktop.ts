import { Hono } from "hono";
import { HonoVariables } from "../types";
import { AppError } from "@tusker/core/lib/errors/app-error";
import { fetchUserPermissions, fetchWorkspacePermissions } from "@tusker/core/permissions";
import { ProjectService } from "@tusker/core/server/services/project/index";
import { TasksService } from "@tusker/core/server/services/task/tasks.service";
import { TagService } from "@tusker/core/server/services/tag/tag.service";
import { serializeIndentForClient } from "@tusker/core/lib/procurement/serialize-indent";
import prisma from "@tusker/db";

/**
 * Server functions that the website's server-rendered pages call directly and
 * that had no route yet. The desktop app runs those same page files (see
 * apps/tusker-desktop/src/overrides) and reaches the functions through here, so
 * each route returns exactly what the function returns on the website.
 *
 * Every route checks workspace membership first; the functions themselves
 * scope results to the signed-in user where the website relies on that.
 */
const desktop = new Hono<{ Variables: HonoVariables }>();

const requireMember = async (workspaceId: string | undefined, userId: string) => {
    if (!workspaceId) throw AppError.ValidationError("workspaceId is required");
    const perms = await fetchWorkspacePermissions(workspaceId, userId, true);
    if (!perms.workspaceMemberId) throw AppError.Forbidden("Not a member of this workspace");
    return perms;
};

/** apps/web/src/data/user/get-user-permissions.ts → getWorkspacePermissions */
desktop.get("/workspace-permissions", async (c) => {
    const workspaceId = c.req.query("workspaceId");
    await requireMember(workspaceId, c.get("user").id);
    const lean = c.req.query("lean") === "true";
    return c.json({ success: true, data: await fetchWorkspacePermissions(workspaceId!, c.get("user").id, lean) });
});

/** apps/web/src/data/user/get-user-permissions.ts → getUserPermissions */
desktop.get("/project-permissions", async (c) => {
    const workspaceId = c.req.query("workspaceId");
    const projectId = c.req.query("projectId");
    await requireMember(workspaceId, c.get("user").id);
    if (!projectId) throw AppError.ValidationError("projectId is required");
    return c.json({ success: true, data: await fetchUserPermissions(workspaceId!, projectId, c.get("user").id) });
});

/** ProjectService.getProjectBySlug (accepts a slug or an id) */
desktop.get("/project-by-slug", async (c) => {
    const workspaceId = c.req.query("workspaceId");
    const slug = c.req.query("slug");
    await requireMember(workspaceId, c.get("user").id);
    if (!slug) throw AppError.ValidationError("slug is required");
    return c.json({ success: true, data: await ProjectService.getProjectBySlug(workspaceId!, slug) });
});

/** ProjectService.getWorkspaceProjectMembers */
desktop.get("/workspace-project-members", async (c) => {
    const workspaceId = c.req.query("workspaceId");
    await requireMember(workspaceId, c.get("user").id);
    return c.json({ success: true, data: await ProjectService.getWorkspaceProjectMembers(workspaceId!) });
});

/** ProjectService.getWorkspaceProjectLeaders */
desktop.get("/workspace-project-leaders", async (c) => {
    const workspaceId = c.req.query("workspaceId");
    await requireMember(workspaceId, c.get("user").id);
    return c.json({ success: true, data: await ProjectService.getWorkspaceProjectLeaders(workspaceId!) });
});

/**
 * TasksService.getTasks with the page's own options (the website's server views
 * pass ones GET /tasks doesn't parse, e.g. expandedProjectIds). Results are
 * scoped to the signed-in user by the service.
 */
desktop.post("/tasks", async (c) => {
    const opts = await c.req.json();
    await requireMember(opts?.workspaceId, c.get("user").id);
    return c.json({ success: true, data: await TasksService.getTasks(opts, c.get("user").id) });
});

/** apps/web/src/data/tag/get-tags.ts → getWorkspaceTags / getWorkspaceTagsWithCount */
desktop.get("/tags", async (c) => {
    const workspaceId = c.req.query("workspaceId");
    await requireMember(workspaceId, c.get("user").id);
    const data =
        c.req.query("withCount") === "true"
            ? await TagService.listWorkspaceTagsWithCount(workspaceId!)
            : await TagService.listWorkspaceTags(workspaceId!);
    return c.json({ success: true, data });
});

// ─── Page data ───────────────────────────────────────────────────────────────
// The queries a few website pages run inline (prisma in the page file). Each
// route runs that page's query unchanged and applies the gate that page or its
// layout applies.

/** procurement/layout.tsx and project procurement pages gate on procurement:view. */
const requireProcurement = async (workspaceId: string | undefined, userId: string) => {
    const perms = await requireMember(workspaceId, userId);
    if (!perms.capabilities?.["procurement:view"]) throw AppError.Forbidden("Procurement isn't available to you");
    return perms;
};

/** A project of this workspace (so another workspace's ids can't be read through here). */
const requireProjectInWorkspace = async (workspaceId: string, projectId: string | undefined) => {
    if (!projectId) throw AppError.ValidationError("projectId is required");
    const project = await prisma.project.findFirst({ where: { id: projectId, workspaceId }, select: { id: true } });
    if (!project) throw AppError.NotFound("Project not found");
};

/** procurement/layout.tsx */
desktop.get("/workspace-name", async (c) => {
    const workspaceId = c.req.query("workspaceId");
    await requireMember(workspaceId, c.get("user").id);
    const workspace = await prisma.workspace.findUnique({ where: { id: workspaceId! }, select: { name: true } });
    return c.json({ success: true, data: workspace });
});

/** procurement/materials/page.tsx, procurement/indents/create/page.tsx */
desktop.get("/procurement/projects", async (c) => {
    const workspaceId = c.req.query("workspaceId");
    await requireProcurement(workspaceId, c.get("user").id);
    const projects = await prisma.project.findMany({
        where: { workspaceId: workspaceId! },
        select: { id: true, name: true, slug: true },
        orderBy: { name: "asc" },
    });
    return c.json({ success: true, data: projects });
});

/** procurement/pos/page.tsx */
desktop.get("/procurement/purchase-orders", async (c) => {
    const workspaceId = c.req.query("workspaceId");
    await requireProcurement(workspaceId, c.get("user").id);
    const purchaseOrders = await prisma.purchaseOrder.findMany({
        where: { workspaceId: workspaceId! },
        include: { vendor: { select: { name: true, companyName: true } } },
        orderBy: { createdAt: "desc" },
    });
    return c.json({ success: true, data: purchaseOrders });
});

/** procurement/pos/[poId]/page.tsx */
desktop.get("/procurement/purchase-orders/:poId", async (c) => {
    const workspaceId = c.req.query("workspaceId");
    await requireProcurement(workspaceId, c.get("user").id);
    const po = await prisma.purchaseOrder.findFirst({
        where: { id: c.req.param("poId"), workspaceId: workspaceId! },
        include: { items: { orderBy: { sortOrder: "asc" } }, vendor: true },
    });
    return c.json({ success: true, data: po });
});

/** procurement/rfqs/create/page.tsx */
desktop.get("/procurement/rfq-create", async (c) => {
    const workspaceId = c.req.query("workspaceId");
    await requireProcurement(workspaceId, c.get("user").id);
    const [indents, vendors] = await Promise.all([
        prisma.indent.findMany({
            where: { workspaceId: workspaceId!, status: "APPROVED" },
            include: {
                project: { select: { id: true, name: true } },
                lineItems: { where: { status: "PENDING" } },
            },
            orderBy: { updatedAt: "desc" },
        }),
        prisma.vendor.findMany({ where: { workspaceId: workspaceId!, isActive: true }, orderBy: { name: "asc" } }),
    ]);
    return c.json({
        success: true,
        data: { indents: indents.filter((ind) => ind.lineItems.length > 0).map(serializeIndentForClient), vendors },
    });
});

/** procurement/indents/[indentId]/page.tsx */
desktop.get("/procurement/indents/:indentId", async (c) => {
    const workspaceId = c.req.query("workspaceId");
    await requireProcurement(workspaceId, c.get("user").id);
    const indent = await prisma.indent.findUnique({
        where: { id: c.req.param("indentId") },
        include: {
            project: { select: { id: true, name: true, projectManagerId: true } },
            requestedBy: { include: { user: { select: { name: true, surname: true, email: true } } } },
            finalApprovedBy: { include: { user: { select: { name: true, surname: true, email: true } } } },
            lineItems: true,
            purchaseOrders: { select: { id: true } },
            selectedVendor: { select: { id: true, name: true, companyName: true } },
        },
    });
    if (!indent || indent.workspaceId !== workspaceId) return c.json({ success: true, data: null });

    const managerMemberId = indent.raisedInProject
        ? indent.project?.projectManagerId ?? indent.requestedBy.reportToId
        : indent.requestedBy.reportToId ?? indent.project?.projectManagerId;
    const approverMemberIds = [...new Set([managerMemberId, ...indent.approverIds].filter(Boolean) as string[])];
    const approvers = approverMemberIds.length
        ? await prisma.workspaceMember.findMany({
              where: { id: { in: approverMemberIds }, workspaceId },
              select: { id: true, workspaceRole: true, user: { select: { name: true, surname: true, email: true } } },
          })
        : [];
    return c.json({
        success: true,
        data: { indent: serializeIndentForClient(indent), approvers, managerMemberId: managerMemberId ?? null },
    });
});

/** p/[slug]/procurement/_components/project-procurement-view.tsx */
desktop.get("/procurement/project-indents", async (c) => {
    const workspaceId = c.req.query("workspaceId");
    const projectId = c.req.query("projectId");
    const userId = c.get("user").id;
    await requireProcurement(workspaceId, userId);
    await requireProjectInWorkspace(workspaceId!, projectId);
    const [indents, member] = await Promise.all([
        prisma.indent.findMany({
            where: { projectId },
            include: {
                project: { select: { projectManagerId: true } },
                requestedBy: { select: { id: true, reportToId: true, user: { select: { name: true, surname: true } } } },
                task: { select: { name: true, taskSlug: true } },
                lineItems: {
                    select: {
                        id: true,
                        materialName: true,
                        unit: true,
                        quantity: true,
                        estimatedUnitPrice: true,
                        finalUnitPrice: true,
                        specifications: true,
                        status: true,
                    },
                },
            },
            orderBy: { createdAt: "desc" },
        }),
        prisma.workspaceMember.findFirst({ where: { workspaceId: workspaceId!, userId }, select: { id: true, workspaceRole: true } }),
    ]);
    return c.json({ success: true, data: { indents: indents.map(serializeIndentForClient), member } });
});

/** p/[slug]/procurement/create-indent/page.tsx: procurement-tagged tasks without an indent yet. */
desktop.get("/procurement/indent-tasks", async (c) => {
    const workspaceId = c.req.query("workspaceId");
    const projectId = c.req.query("projectId");
    await requireProcurement(workspaceId, c.get("user").id);
    await requireProjectInWorkspace(workspaceId!, projectId);
    const [allTasks, existingIndents] = await Promise.all([
        prisma.task.findMany({
            where: {
                projectId,
                isParent: false,
                tags: { some: { OR: [{ requirePurchase: true }, { name: { equals: "procurement", mode: "insensitive" } }] } },
            },
            select: { id: true, name: true, taskSlug: true, dueDate: true },
            orderBy: { createdAt: "desc" },
        }),
        prisma.indent.findMany({ where: { projectId, taskId: { not: null } }, select: { taskId: true } }),
    ]);
    const claimedTaskIds = new Set(existingIndents.map((i) => i.taskId));
    return c.json({ success: true, data: allTasks.filter((t) => !claimedTaskIds.has(t.id)) });
});

/** team/leaves/page.tsx: the viewer's own member profile. */
desktop.get("/my-member-profile", async (c) => {
    const workspaceId = c.req.query("workspaceId");
    const userId = c.get("user").id;
    await requireMember(workspaceId, userId);
    const profile = await prisma.workspaceMember.findFirst({
        where: { workspaceId: workspaceId!, userId },
        select: {
            designation: true,
            employeeId: true,
            workspaceRole: true,
            department: { select: { name: true } },
            reportTo: { select: { user: { select: { surname: true, name: true } } } },
            user: { select: { name: true, surname: true, image: true } },
        },
    });
    return c.json({ success: true, data: profile });
});

/** team/settings/page.tsx (admins only, as that page shows its content to admins only). */
desktop.get("/points-reset-period", async (c) => {
    const workspaceId = c.req.query("workspaceId");
    const perms = await requireMember(workspaceId, c.get("user").id);
    if (!perms.isWorkspaceAdmin) throw AppError.Forbidden("Only workspace owners and admins can see this");
    const workspace = await prisma.workspace.findUnique({ where: { id: workspaceId! }, select: { pointsResetPeriod: true } });
    return c.json({ success: true, data: workspace });
});

export default desktop;
