import prisma from "@tusker/db";
import { AppError } from "../../../lib/errors/app-error";
import { ACTIVE_MEMBER } from "../../../lib/constants/member-status";
import { sendNotification } from "../../../lib/notifications";
import {
    calendarDayKey,
    pointsPeriodStart,
    signedWorkingDays,
    toDateOnly,
} from "../../../lib/date-utils";
import { fetchWorkspacePermissions } from "../../../permissions";

/**
 * Reward points (spec: 5.md at the repo root).
 *
 * An append-only ledger in PointsEntry: a balance is SUM(points) over the
 * workspace's reset period. Completion awards are written by TaskRepository
 * inside the status-change transaction, from a payload this service computes
 * beforehand, so the repository stays free of business logic and I/O.
 */

export const POINTS_KIND = {
    COMPLETION: "TASK_COMPLETION",
    REVERSAL: "TASK_REVERSAL",
    MANUAL: "MANUAL",
} as const;

/** A finished completion award, ready for TaskRepository to write. */
export interface CompletionAward {
    workspaceId: string;
    workspaceMemberId: string;
    points: number;
    reason: string;
    taskId: string;
    occurredAt: Date;
}

const MAX_MANUAL_POINTS = 1000; // fat-finger guard, not a business cap

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

export class PointsService {
    /** "yyyy-MM-dd" keys of the workspace's public holidays between two days, inclusive. */
    static async holidayKeys(workspaceId: string, a: Date, b: Date): Promise<Set<string>> {
        const [from, to] = [toDateOnly(a)!, toDateOnly(b)!].sort((x, y) => x.getTime() - y.getTime());
        const rows = await prisma.public_holiday.findMany({
            where: { workspaceId, date: { gte: from, lte: to } },
            select: { date: true },
        });
        return new Set(rows.map((r) => calendarDayKey(r.date)));
    }

    /**
     * The award for completing a task at `completedAt`, or null when nothing is
     * scored: no due date, no assignee, or finished on the due day. The assignee
     * at the moment of completion earns it.
     */
    static async computeAward(params: {
        workspaceId: string;
        taskId: string;
        taskName: string;
        assigneeId: string | null | undefined; // ProjectMember id
        dueDate: Date | null | undefined;
        completedAt: Date;
    }): Promise<CompletionAward | null> {
        const { workspaceId, taskId, taskName, assigneeId, dueDate, completedAt } = params;
        if (!dueDate || !assigneeId) return null;

        const holidays = await this.holidayKeys(workspaceId, dueDate, completedAt);
        const points = signedWorkingDays(completedAt, dueDate, holidays);
        if (points === 0) return null;

        const assignee = await prisma.projectMember.findUnique({
            where: { id: assigneeId },
            select: { workspaceMemberId: true },
        });
        if (!assignee) return null;

        return {
            workspaceId,
            workspaceMemberId: assignee.workspaceMemberId,
            points,
            taskId,
            occurredAt: completedAt,
            reason: `Completed "${taskName}" ${plural(Math.abs(points), "working day")} ${points > 0 ? "early" : "late"}`,
        };
    }

    /**
     * Whose points a user may see. The one place this rule lives, so the coming
     * manager model changes only this function. Interim rule from the spec:
     * owners and admins see everyone (ids = null); managers see their reports
     * but not themselves; everyone else sees only themselves.
     */
    static async visibleMemberIds(workspaceId: string, userId: string) {
        const me = await prisma.workspaceMember.findFirst({
            where: { workspaceId, userId, ...ACTIVE_MEMBER },
            select: {
                id: true,
                workspaceRole: true,
                subordinates: { where: ACTIVE_MEMBER, select: { id: true } },
            },
        });
        if (!me) throw AppError.Forbidden("You are not a member of this workspace.");

        let ids: string[] | null;
        if (me.workspaceRole === "OWNER" || me.workspaceRole === "ADMIN") ids = null;
        else if (me.workspaceRole === "MANAGER") ids = me.subordinates.map((s) => s.id);
        else ids = [me.id];

        return { selfMemberId: me.id, ids };
    }

    private static async periodFor(workspaceId: string) {
        const workspace = await prisma.workspace.findUnique({
            where: { id: workspaceId },
            select: { pointsResetPeriod: true },
        });
        const period = workspace?.pointsResetPeriod ?? "MONTHLY";
        return { period, since: pointsPeriodStart(period) };
    }

    /** Totals for the current period, one row per visible active member, highest first. */
    static async summary(workspaceId: string, userId: string) {
        const [{ selfMemberId, ids }, { period, since }, permissions] = await Promise.all([
            this.visibleMemberIds(workspaceId, userId),
            this.periodFor(workspaceId),
            fetchWorkspacePermissions(workspaceId, userId, true),
        ]);
        const memberFilter = ids ? { in: ids } : undefined;

        const [totals, members] = await Promise.all([
            prisma.pointsEntry.groupBy({
                by: ["workspaceMemberId"],
                where: {
                    workspaceId,
                    ...(since ? { occurredAt: { gte: since } } : {}),
                    ...(memberFilter ? { workspaceMemberId: memberFilter } : {}),
                },
                _sum: { points: true },
            }),
            prisma.workspaceMember.findMany({
                where: { workspaceId, ...ACTIVE_MEMBER, ...(memberFilter ? { id: memberFilter } : {}) },
                select: {
                    id: true,
                    designation: true,
                    user: { select: { name: true, surname: true, image: true } },
                },
            }),
        ]);

        const byMember = new Map(totals.map((t) => [t.workspaceMemberId, t._sum.points ?? 0]));
        const rows = members
            .map((m) => ({
                memberId: m.id,
                name: m.user.surname || m.user.name,
                image: m.user.image,
                designation: m.designation,
                points: byMember.get(m.id) ?? 0,
            }))
            .sort((a, b) => b.points - a.points || a.name.localeCompare(b.name));

        return {
            period,
            since,
            selfMemberId,
            canAward: permissions.capabilities?.["points:award"] === true,
            members: rows,
        };
    }

    /**
     * Ledger lines for the current period, newest first. Reversals are their own
     * lines next to the award they cancel, never hidden.
     */
    static async entries(
        workspaceId: string,
        userId: string,
        options: { memberId?: string; limit?: number; cursor?: string } = {}
    ) {
        const [{ ids }, { since }] = await Promise.all([
            this.visibleMemberIds(workspaceId, userId),
            this.periodFor(workspaceId),
        ]);
        if (options.memberId && ids && !ids.includes(options.memberId)) {
            throw AppError.Forbidden("You can't view this member's points.");
        }

        const limit = Math.min(Math.max(options.limit ?? 50, 1), 100);
        const rows = await prisma.pointsEntry.findMany({
            where: {
                workspaceId,
                ...(since ? { occurredAt: { gte: since } } : {}),
                ...(options.memberId
                    ? { workspaceMemberId: options.memberId }
                    : ids ? { workspaceMemberId: { in: ids } } : {}),
            },
            orderBy: [{ occurredAt: "desc" }, { id: "desc" }],
            take: limit + 1,
            ...(options.cursor ? { cursor: { id: options.cursor }, skip: 1 } : {}),
            select: {
                id: true,
                points: true,
                kind: true,
                reason: true,
                occurredAt: true,
                reversedAt: true,
                workspaceMemberId: true,
                workspaceMember: { select: { user: { select: { name: true, surname: true } } } },
                awardedBy: { select: { user: { select: { name: true, surname: true } } } },
                task: { select: { id: true, name: true, taskSlug: true } },
            },
        });

        const hasMore = rows.length > limit;
        const page = hasMore ? rows.slice(0, limit) : rows;
        return {
            entries: page.map(({ workspaceMember, awardedBy, ...e }) => ({
                ...e,
                memberName: workspaceMember.user.surname || workspaceMember.user.name,
                awardedByName: awardedBy ? awardedBy.user.surname || awardedBy.user.name : null,
            })),
            nextCursor: hasMore ? page[page.length - 1].id : null,
        };
    }

    /** A hand-given award or deduction. Needs the points:award capability and a reason. */
    static async awardManual(
        workspaceId: string,
        actorUserId: string,
        input: { memberId: unknown; points: unknown; reason: unknown }
    ) {
        const points = Number(input.points);
        const reason = typeof input.reason === "string" ? input.reason.trim() : "";
        const memberId = typeof input.memberId === "string" ? input.memberId : "";

        if (!Number.isInteger(points) || points === 0 || Math.abs(points) > MAX_MANUAL_POINTS) {
            throw AppError.ValidationError(`Points must be a whole number between -${MAX_MANUAL_POINTS} and ${MAX_MANUAL_POINTS}, and not 0.`);
        }
        if (reason.length < 3 || reason.length > 500) {
            throw AppError.ValidationError("A reason of 3 to 500 characters is required.");
        }
        if (!memberId) throw AppError.ValidationError("Choose who to award.");

        const permissions = await fetchWorkspacePermissions(workspaceId, actorUserId, true);
        if (!permissions.capabilities?.["points:award"] || !permissions.workspaceMemberId) {
            throw AppError.Forbidden("You don't have permission to award points.");
        }
        if (memberId === permissions.workspaceMemberId) {
            throw AppError.Forbidden("You can't award points to yourself.");
        }

        const target = await prisma.workspaceMember.findFirst({
            where: { id: memberId, workspaceId, ...ACTIVE_MEMBER },
            select: { id: true, userId: true },
        });
        if (!target) throw AppError.NotFound("That member is not active in this workspace.");

        const entry = await prisma.pointsEntry.create({
            data: {
                workspaceId,
                workspaceMemberId: target.id,
                points,
                kind: POINTS_KIND.MANUAL,
                reason,
                awardedById: permissions.workspaceMemberId,
            },
        });

        // Someone losing points must be told why; the ledger row stands either way.
        await sendNotification({
            userId: target.userId,
            workspaceId,
            type: "POINTS",
            entityType: "PointsEntry",
            entityId: entry.id,
            title: points > 0
                ? `You received ${plural(points, "point")}`
                : `${plural(-points, "point")} deducted`,
            body: reason,
        }).catch((err) => console.error("[POINTS_NOTIFY_ERROR]", err));

        return entry;
    }
}
