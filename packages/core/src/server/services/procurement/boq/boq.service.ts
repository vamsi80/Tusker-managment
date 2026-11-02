import prisma, { Prisma } from "@tusker/db";
import { AppError } from "../../../../lib/errors/app-error";
import {
    BOQ_TRANSITIONS,
    LENGTH_UNITS,
    lineTotals,
    type BoqStatus,
    type LengthUnit,
} from "../../../../lib/procurement/boq";

/** Seeded the first time a workspace opens the rate sheet or a BOQ. */
const DEFAULT_TRADES = ["Carpentry", "Electrical", "Civil", "Plumbing", "Painting", "False ceiling", "HVAC"];

export type RateSheetKind = "material" | "labour" | "labour_material";
const KIND_TO_SERVICE = { material: "SUPPLY", labour: "LABOUR", labour_material: "LABOUR_WITH_MATERIAL" } as const;

export type BoqLineData = {
    tradeId: string;
    zoneId?: string | null;
    capabilityId?: string | null;
    vendorId?: string | null;
    description?: string;
    unit?: string;
    rate?: number;
    inputUnit?: LengthUnit;
    length?: number | null;
    breadth?: number | null;
    depth?: number | null;
    quantity?: number;
    wastagePercent?: number;
    markupPercent?: number;
    notes?: string | null;
};

/** The client or an open transaction: reprice runs inside the rate writer's transaction. */
type Db = Prisma.TransactionClient | typeof prisma;

const lineInclude = {
    trade: { select: { id: true, name: true } },
    zone: { select: { id: true, name: true } },
    vendor: { select: { id: true, name: true, companyName: true } },
} satisfies Prisma.BoqLineItemInclude;

type LineRow = Prisma.BoqLineItemGetPayload<{ include: typeof lineInclude }>;

const num = (d: Prisma.Decimal | null) => (d === null ? null : Number(d));

/** Decimals as plain numbers so the client never has to parse strings. */
const serializeLine = (l: LineRow) => ({
    ...l,
    length: num(l.length),
    breadth: num(l.breadth),
    depth: num(l.depth),
    quantity: Number(l.quantity),
    measuredQty: Number(l.measuredQty),
    markupPercent: Number(l.markupPercent),
    wastagePercent: Number(l.wastagePercent),
});

export class BoqService {
    // Trades -----------------------------------------------------------------

    static async listTrades(workspaceId: string) {
        const count = await prisma.trade.count({ where: { workspaceId } });
        if (count === 0) {
            await prisma.trade.createMany({
                data: DEFAULT_TRADES.map((name, sortOrder) => ({ workspaceId, name, sortOrder })),
                skipDuplicates: true,
            });
        }
        return prisma.trade.findMany({ where: { workspaceId }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }] });
    }

    static async createTrade(workspaceId: string, name: string) {
        const clean = name.trim();
        if (!clean) throw AppError.ValidationError("Department name is required");
        const existing = await prisma.trade.findFirst({
            where: { workspaceId, name: { equals: clean, mode: "insensitive" } },
        });
        if (existing) return existing;
        const last = await prisma.trade.aggregate({ where: { workspaceId }, _max: { sortOrder: true } });
        return prisma.trade.create({ data: { workspaceId, name: clean, sortOrder: (last._max.sortOrder ?? -1) + 1 } });
    }

    // Rate sheet -------------------------------------------------------------

    /** Every vendor's rates in one list: the material list or a contractor list. */
    static async rateSheet(workspaceId: string, kind?: RateSheetKind, tradeId?: string) {
        return prisma.vendorMaterialCapability.findMany({
            where: {
                workspaceId,
                ...(kind ? { serviceType: KIND_TO_SERVICE[kind] } : {}),
                ...(tradeId ? { tradeId } : {}),
                vendor: { status: { not: "BLACKLISTED" } },
            },
            include: {
                vendor: { select: { id: true, name: true, companyName: true, vendorType: true, verificationStatus: true } },
                trade: { select: { id: true, name: true } },
                group: { select: { id: true, name: true, parentId: true } },
            },
            orderBy: [{ materialName: "asc" }],
        });
    }

    // BOQs -------------------------------------------------------------------

    static async listBoqs(workspaceId: string, projectId?: string) {
        const boqs = await prisma.boq.findMany({
            where: { workspaceId, ...(projectId ? { projectId } : {}) },
            include: {
                project: { select: { id: true, name: true, slug: true } },
                createdBy: { select: { user: { select: { name: true } } } },
                _count: { select: { lines: true } },
            },
            orderBy: { updatedAt: "desc" },
        });
        const sums = await prisma.boqLineItem.groupBy({
            by: ["boqId"],
            where: { boqId: { in: boqs.map((b) => b.id) } },
            _sum: { costAmount: true, amount: true },
        });
        const byId = new Map(sums.map((s) => [s.boqId, s._sum]));
        return boqs.map((b) => ({
            ...b,
            costAmount: byId.get(b.id)?.costAmount ?? 0,
            amount: byId.get(b.id)?.amount ?? 0,
        }));
    }

    static async getBoq(workspaceId: string, boqId: string) {
        const boq = await prisma.boq.findFirst({
            where: { id: boqId, workspaceId },
            include: {
                project: { select: { id: true, name: true, slug: true, boqZones: { orderBy: [{ sortOrder: "asc" }, { name: "asc" }] } } },
                lines: { include: lineInclude, orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] },
                revisions: { select: { id: true, revision: true, status: true } },
                revisedFrom: { select: { id: true, revision: true } },
            },
        });
        if (!boq) throw AppError.NotFound("BOQ not found");
        return { ...boq, lines: boq.lines.map(serializeLine) };
    }

    static async createBoq(workspaceId: string, projectId: string, name: string, createdById: string) {
        const project = await prisma.project.findFirst({ where: { id: projectId, workspaceId }, select: { id: true } });
        if (!project) throw AppError.NotFound("Project not found");
        const clean = name.trim();
        if (!clean) throw AppError.ValidationError("BOQ name is required");
        const clash = await prisma.boq.findFirst({ where: { projectId, name: clean }, select: { id: true } });
        if (clash) throw AppError.Conflict("This project already has a BOQ with that name");
        return prisma.boq.create({ data: { workspaceId, projectId, name: clean, createdById } });
    }

    static async deleteBoq(workspaceId: string, boqId: string) {
        const boq = await BoqService.draftBoq(workspaceId, boqId);
        await prisma.boq.delete({ where: { id: boq.id } });
    }

    static async setStatus(workspaceId: string, boqId: string, to: BoqStatus) {
        const boq = await prisma.boq.findFirst({ where: { id: boqId, workspaceId } });
        if (!boq) throw AppError.NotFound("BOQ not found");
        const from = boq.status as BoqStatus;
        if (!BOQ_TRANSITIONS[from]?.includes(to)) {
            throw AppError.ValidationError(`This BOQ is ${from.toLowerCase()} and can't move to ${to.toLowerCase()}`);
        }
        if (to === "SUBMITTED") {
            const lines = await prisma.boqLineItem.count({ where: { boqId } });
            if (lines === 0) throw AppError.ValidationError("Add at least one line before submitting");
        }
        return prisma.boq.update({ where: { id: boqId }, data: { status: to } });
    }

    /**
     * Copy a sent-out BOQ into revision + 1 as a fresh draft. The source becomes
     * SUPERSEDED, so there is only ever one live revision per BOQ name.
     */
    static async reviseBoq(workspaceId: string, boqId: string, createdById: string) {
        return prisma.$transaction(async (tx) => {
            const source = await tx.boq.findFirst({ where: { id: boqId, workspaceId }, include: { lines: true } });
            if (!source) throw AppError.NotFound("BOQ not found");
            if (source.status === "DRAFT" || source.status === "SUPERSEDED") {
                throw AppError.ValidationError("Only a submitted, approved or rejected BOQ can be revised");
            }
            const latest = await tx.boq.aggregate({
                where: { projectId: source.projectId, name: source.name },
                _max: { revision: true },
            });
            const next = await tx.boq.create({
                data: {
                    workspaceId,
                    projectId: source.projectId,
                    name: source.name,
                    revision: (latest._max.revision ?? source.revision) + 1,
                    revisedFromId: source.id,
                    createdById,
                },
            });
            if (source.lines.length) {
                await tx.boqLineItem.createMany({
                    data: source.lines.map(({ id: _id, boqId: _boqId, createdAt: _c, updatedAt: _u, ...line }) => ({
                        ...line,
                        boqId: next.id,
                    })),
                });
            }
            await tx.boq.update({ where: { id: source.id }, data: { status: "SUPERSEDED" } });
            return next;
        });
    }

    // Lines ------------------------------------------------------------------

    private static async draftBoq(workspaceId: string, boqId: string) {
        const boq = await prisma.boq.findFirst({ where: { id: boqId, workspaceId } });
        if (!boq) throw AppError.NotFound("BOQ not found");
        if (boq.status !== "DRAFT") {
            throw AppError.ValidationError("Only a draft BOQ can be changed. Start a new revision instead.");
        }
        return boq;
    }

    /** Validates ids against the workspace/project and fills snapshots from the rate sheet. */
    private static async resolveLine(
        workspaceId: string,
        projectId: string,
        data: BoqLineData,
        current?: {
            description: string;
            unit: string;
            rate: number;
            vendorId: string | null;
            serviceType: LineRow["serviceType"];
            wastagePercent: Prisma.Decimal | number;
        }
    ) {
        const trade = await prisma.trade.findFirst({ where: { id: data.tradeId, workspaceId }, select: { id: true } });
        if (!trade) throw AppError.ValidationError("Choose a department");

        if (data.zoneId) {
            const zone = await prisma.boqZone.findFirst({ where: { id: data.zoneId, projectId }, select: { id: true } });
            if (!zone) throw AppError.ValidationError("Unknown zone");
        }

        let snapshot = current ?? null;
        if (data.capabilityId) {
            const cap = await prisma.vendorMaterialCapability.findFirst({
                where: { id: data.capabilityId, workspaceId },
            });
            if (!cap) throw AppError.ValidationError("That rate is no longer on the rate sheet");
            // Explicit fields in `data` still win over these copies.
            snapshot = {
                description: cap.materialName,
                unit: cap.unit ?? "nos",
                rate: cap.rate ?? 0,
                vendorId: cap.vendorId,
                serviceType: cap.serviceType,
                wastagePercent: cap.wastagePercent,
            };
        } else if (data.vendorId) {
            const vendor = await prisma.vendor.findFirst({ where: { id: data.vendorId, workspaceId }, select: { id: true } });
            if (!vendor) throw AppError.ValidationError("Unknown contractor");
        }

        const description = (data.description ?? snapshot?.description ?? "").trim();
        if (!description) throw AppError.ValidationError("Item description is required");
        const unit = (data.unit ?? snapshot?.unit ?? "nos").trim() || "nos";
        const rate = data.rate ?? snapshot?.rate ?? 0;
        if (!Number.isInteger(rate) || rate < 0) throw AppError.ValidationError("Rate must be a whole number of paise");
        const inputUnit = data.inputUnit && data.inputUnit in LENGTH_UNITS ? data.inputUnit : "mm";
        const quantity = data.quantity ?? 1;
        const markupPercent = data.markupPercent ?? 0;
        const wastagePercent = data.wastagePercent ?? Number(snapshot?.wastagePercent ?? 0);
        if (wastagePercent < 0 || wastagePercent > 100) throw AppError.ValidationError("Wastage must be between 0 and 100%");

        const totals = lineTotals({
            rate,
            rateUnit: unit,
            inputUnit,
            length: data.length,
            breadth: data.breadth,
            depth: data.depth,
            quantity,
            wastagePercent,
            markupPercent,
        });

        return {
            tradeId: trade.id,
            zoneId: data.zoneId ?? null,
            capabilityId: data.capabilityId ?? null,
            vendorId: data.vendorId ?? snapshot?.vendorId ?? null,
            serviceType: snapshot?.serviceType ?? "LABOUR",
            description,
            unit,
            rate,
            inputUnit,
            length: data.length ?? null,
            breadth: data.breadth ?? null,
            depth: data.depth ?? null,
            quantity,
            wastagePercent,
            markupPercent,
            notes: data.notes?.trim() || null,
            ...totals,
        };
    }

    static async addLine(workspaceId: string, boqId: string, data: BoqLineData) {
        const boq = await BoqService.draftBoq(workspaceId, boqId);
        const resolved = await BoqService.resolveLine(workspaceId, boq.projectId, data);
        const last = await prisma.boqLineItem.aggregate({ where: { boqId }, _max: { sortOrder: true } });
        const line = await prisma.boqLineItem.create({
            data: { ...resolved, boqId, sortOrder: (last._max.sortOrder ?? -1) + 1 },
            include: lineInclude,
        });
        await prisma.boq.update({ where: { id: boqId }, data: { updatedAt: new Date() } });
        return serializeLine(line);
    }

    /** Partial edits are merged over the stored line, then everything is recomputed. */
    static async updateLine(workspaceId: string, boqId: string, lineId: string, data: Partial<BoqLineData>) {
        const boq = await BoqService.draftBoq(workspaceId, boqId);
        const current = await prisma.boqLineItem.findFirst({ where: { id: lineId, boqId } });
        if (!current) throw AppError.NotFound("BOQ line not found");

        const merged: BoqLineData = {
            tradeId: data.tradeId ?? current.tradeId,
            zoneId: data.zoneId !== undefined ? data.zoneId : current.zoneId,
            capabilityId: data.capabilityId !== undefined ? data.capabilityId : current.capabilityId,
            vendorId: data.vendorId !== undefined ? data.vendorId : current.vendorId,
            description: data.description ?? current.description,
            unit: data.unit ?? current.unit,
            rate: data.rate ?? current.rate,
            inputUnit: (data.inputUnit ?? current.inputUnit) as LengthUnit,
            length: data.length !== undefined ? data.length : num(current.length),
            breadth: data.breadth !== undefined ? data.breadth : num(current.breadth),
            depth: data.depth !== undefined ? data.depth : num(current.depth),
            quantity: data.quantity ?? Number(current.quantity),
            markupPercent: data.markupPercent ?? Number(current.markupPercent),
            wastagePercent: data.wastagePercent ?? Number(current.wastagePercent),
            notes: data.notes !== undefined ? data.notes : current.notes,
        };
        // Picking a different rate-sheet row re-copies its description, unit and rate.
        const repicked = data.capabilityId && data.capabilityId !== current.capabilityId;
        if (repicked) {
            if (data.description === undefined) merged.description = undefined;
            if (data.unit === undefined) merged.unit = undefined;
            if (data.rate === undefined) merged.rate = undefined;
            if (data.vendorId === undefined) merged.vendorId = undefined;
            if (data.wastagePercent === undefined) merged.wastagePercent = undefined;
        }

        const resolved = await BoqService.resolveLine(
            workspaceId,
            boq.projectId,
            merged,
            repicked ? undefined : current
        );
        const line = await prisma.boqLineItem.update({ where: { id: lineId }, data: resolved, include: lineInclude });
        await prisma.boq.update({ where: { id: boqId }, data: { updatedAt: new Date() } });
        return serializeLine(line);
    }

    /**
     * Re-copy name, unit and rate from the rate sheet onto every DRAFT BOQ line
     * priced from these rows, and recompute. Submitted, approved and superseded
     * BOQs keep the prices they were sent with. Every rate writer calls this
     * inside its own transaction. Returns how many lines changed.
     */
    static async repriceCapabilities(db: Db, capabilityIds: string[], boqId?: string) {
        if (!capabilityIds.length) return 0;
        const lines = await db.boqLineItem.findMany({
            where: { capabilityId: { in: capabilityIds }, boq: { status: "DRAFT" }, ...(boqId ? { boqId } : {}) },
            include: { capability: { select: { materialName: true, unit: true, rate: true } } },
        });
        const touched = new Set<string>();
        let changed = 0;
        // ponytail: one UPDATE per changed line; fine for a few hundred draft lines, batch with raw SQL if it grows.
        for (const line of lines) {
            if (!line.capability) continue;
            const next = {
                description: line.capability.materialName,
                unit: line.capability.unit ?? "nos",
                rate: line.capability.rate ?? 0,
            };
            if (next.description === line.description && next.unit === line.unit && next.rate === line.rate) continue;
            const totals = lineTotals({
                rate: next.rate,
                rateUnit: next.unit,
                inputUnit: line.inputUnit as LengthUnit,
                length: num(line.length),
                breadth: num(line.breadth),
                depth: num(line.depth),
                quantity: Number(line.quantity),
                wastagePercent: Number(line.wastagePercent),
                markupPercent: Number(line.markupPercent),
            });
            await db.boqLineItem.update({ where: { id: line.id }, data: { ...next, ...totals } });
            touched.add(line.boqId);
            changed++;
        }
        if (touched.size) {
            await db.boq.updateMany({ where: { id: { in: [...touched] } }, data: { updatedAt: new Date() } });
        }
        return changed;
    }

    /** "Refresh rates" on a draft: pull every rate-sheet line up to today's rates. */
    static async refreshRates(workspaceId: string, boqId: string) {
        await BoqService.draftBoq(workspaceId, boqId);
        const lines = await prisma.boqLineItem.findMany({
            where: { boqId, capabilityId: { not: null } },
            select: { capabilityId: true },
        });
        const ids = [...new Set(lines.map((l) => l.capabilityId!))];
        return prisma.$transaction((tx) => BoqService.repriceCapabilities(tx, ids, boqId));
    }

    static async deleteLine(workspaceId: string, boqId: string, lineId: string) {
        await BoqService.draftBoq(workspaceId, boqId);
        const { count } = await prisma.boqLineItem.deleteMany({ where: { id: lineId, boqId } });
        if (!count) throw AppError.NotFound("BOQ line not found");
    }

    // Rate groups (rate-sheet categories / subcategories) --------------------

    /** Flat list; the client nests subcategories under their parentId. */
    static async listRateGroups(workspaceId: string) {
        return prisma.rateGroup.findMany({
            where: { workspaceId },
            orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
        });
    }

    private static async rateGroupNameFree(
        workspaceId: string,
        tradeId: string | null,
        parentId: string | null,
        name: string,
        exceptId?: string
    ) {
        const clash = await prisma.rateGroup.findFirst({
            where: {
                workspaceId,
                tradeId,
                parentId,
                name: { equals: name, mode: "insensitive" },
                ...(exceptId ? { id: { not: exceptId } } : {}),
            },
            select: { id: true },
        });
        if (clash) throw AppError.Conflict(parentId ? "That category already has a subcategory with this name" : "A category with this name already exists");
    }

    /** A parent must be a category (one level deep) in this workspace. */
    private static async rateCategory(workspaceId: string, id: string) {
        const parent = await prisma.rateGroup.findFirst({ where: { id, workspaceId } });
        if (!parent) throw AppError.ValidationError("Unknown category");
        if (parent.parentId) throw AppError.ValidationError("Subcategories can't have subcategories");
        return parent;
    }

    static async createRateGroup(
        workspaceId: string,
        data: { name: string; tradeId?: string | null; parentId?: string | null }
    ) {
        const name = data.name.trim();
        if (!name) throw AppError.ValidationError("Name is required");
        let tradeId = data.tradeId ?? null;
        const parentId = data.parentId ?? null;
        if (parentId) {
            tradeId = (await BoqService.rateCategory(workspaceId, parentId)).tradeId; // a subcategory lives in its parent's list
        } else if (tradeId) {
            const trade = await prisma.trade.findFirst({ where: { id: tradeId, workspaceId }, select: { id: true } });
            if (!trade) throw AppError.ValidationError("Unknown department");
        }
        await BoqService.rateGroupNameFree(workspaceId, tradeId, parentId, name);
        const last = await prisma.rateGroup.aggregate({ where: { workspaceId, tradeId, parentId }, _max: { sortOrder: true } });
        return prisma.rateGroup.create({
            data: { workspaceId, tradeId, parentId, name, sortOrder: (last._max.sortOrder ?? -1) + 1 },
        });
    }

    /** Rename, reorder, or move a subcategory (its rates go with it) to another category in the same list. */
    static async updateRateGroup(
        workspaceId: string,
        id: string,
        data: { name?: string; parentId?: string; sortOrder?: number }
    ) {
        const group = await prisma.rateGroup.findFirst({ where: { id, workspaceId } });
        if (!group) throw AppError.NotFound("Category not found");

        let parentId = group.parentId;
        if (data.parentId !== undefined && data.parentId !== group.parentId) {
            if (!group.parentId) throw AppError.ValidationError("Only a subcategory can be moved");
            const target = await BoqService.rateCategory(workspaceId, data.parentId);
            if (target.tradeId !== group.tradeId) throw AppError.ValidationError("Move it to a category in the same list");
            parentId = target.id;
        }
        const name = data.name === undefined ? group.name : data.name.trim();
        if (!name) throw AppError.ValidationError("Name is required");
        if (name !== group.name || parentId !== group.parentId) {
            await BoqService.rateGroupNameFree(workspaceId, group.tradeId, parentId, name, id);
        }
        const moved = parentId !== group.parentId;
        let sortOrder = data.sortOrder;
        if (sortOrder === undefined && moved) {
            const last = await prisma.rateGroup.aggregate({ where: { parentId }, _max: { sortOrder: true } });
            sortOrder = (last._max.sortOrder ?? -1) + 1;
        }
        return prisma.rateGroup.update({
            where: { id },
            data: { name, parentId, ...(sortOrder === undefined ? {} : { sortOrder }) },
        });
    }

    /** Subcategories go with their category; the rates in them just become ungrouped. */
    static async deleteRateGroup(workspaceId: string, id: string) {
        const { count } = await prisma.rateGroup.deleteMany({ where: { id, workspaceId } });
        if (!count) throw AppError.NotFound("Category not found");
    }

    // Zones ------------------------------------------------------------------

    private static async projectInWorkspace(workspaceId: string, projectId: string) {
        const project = await prisma.project.findFirst({ where: { id: projectId, workspaceId }, select: { id: true } });
        if (!project) throw AppError.NotFound("Project not found");
    }

    static async createZone(workspaceId: string, projectId: string, name: string) {
        await BoqService.projectInWorkspace(workspaceId, projectId);
        const clean = name.trim();
        if (!clean) throw AppError.ValidationError("Zone name is required");
        const existing = await prisma.boqZone.findFirst({
            where: { projectId, name: { equals: clean, mode: "insensitive" } },
        });
        if (existing) return existing;
        const last = await prisma.boqZone.aggregate({ where: { projectId }, _max: { sortOrder: true } });
        return prisma.boqZone.create({ data: { projectId, name: clean, sortOrder: (last._max.sortOrder ?? -1) + 1 } });
    }

    static async renameZone(workspaceId: string, projectId: string, zoneId: string, name: string) {
        await BoqService.projectInWorkspace(workspaceId, projectId);
        const clean = name.trim();
        if (!clean) throw AppError.ValidationError("Zone name is required");
        const zone = await prisma.boqZone.findFirst({ where: { id: zoneId, projectId } });
        if (!zone) throw AppError.NotFound("Zone not found");
        const clash = await prisma.boqZone.findFirst({
            where: { projectId, id: { not: zoneId }, name: { equals: clean, mode: "insensitive" } },
        });
        if (clash) throw AppError.Conflict("A zone with that name already exists");
        return prisma.boqZone.update({ where: { id: zoneId }, data: { name: clean } });
    }

    /** Lines in a deleted zone fall back to "No zone" rather than disappearing. */
    static async deleteZone(workspaceId: string, projectId: string, zoneId: string) {
        await BoqService.projectInWorkspace(workspaceId, projectId);
        const { count } = await prisma.boqZone.deleteMany({ where: { id: zoneId, projectId } });
        if (!count) throw AppError.NotFound("Zone not found");
    }
}
