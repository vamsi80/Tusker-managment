import { type ApiResponse } from "./types";
import { apiFetch } from "./fetch-wrapper";
import type { PointsResetPeriod } from "@tusker/core/lib/date-utils";

export interface PointsMemberTotal {
    memberId: string;
    name: string;
    image: string | null;
    designation: string | null;
    points: number;
}

export interface PointsSummary {
    period: PointsResetPeriod;
    /** Start of the current period (ISO), or null for all time. */
    since: string | null;
    selfMemberId: string;
    canAward: boolean;
    members: PointsMemberTotal[];
}

export interface PointsLedgerEntry {
    id: string;
    points: number;
    kind: "TASK_COMPLETION" | "TASK_REVERSAL" | "MANUAL";
    reason: string;
    occurredAt: string;
    reversedAt: string | null;
    workspaceMemberId: string;
    memberName: string;
    awardedByName: string | null;
    task: { id: string; name: string; taskSlug: string } | null;
}

export const pointsClient = {
    getSummary: async (workspaceId: string): Promise<PointsSummary> => {
        const res = await apiFetch<ApiResponse<PointsSummary>>(`/points/${workspaceId}/summary`);
        return res.data!;
    },

    getEntries: async (
        workspaceId: string,
        params: { memberId?: string; cursor?: string; limit?: number } = {}
    ): Promise<{ entries: PointsLedgerEntry[]; nextCursor: string | null }> => {
        const search = new URLSearchParams();
        if (params.memberId) search.set("memberId", params.memberId);
        if (params.cursor) search.set("cursor", params.cursor);
        if (params.limit) search.set("limit", String(params.limit));
        const qs = search.toString();
        const res = await apiFetch<ApiResponse<{ entries: PointsLedgerEntry[]; nextCursor: string | null }>>(
            `/points/${workspaceId}/entries${qs ? `?${qs}` : ""}`
        );
        return res.data ?? { entries: [], nextCursor: null };
    },

    /** Positive awards, negative deducts. A reason is required. */
    award: async (workspaceId: string, body: { memberId: string; points: number; reason: string }) => {
        const res = await apiFetch<ApiResponse>(`/points/${workspaceId}/awards`, {
            method: "POST",
            body: JSON.stringify(body),
        });
        return res.data;
    },

    setResetPeriod: async (workspaceId: string, pointsResetPeriod: PointsResetPeriod) => {
        await apiFetch<ApiResponse>(`/workspaces/settings?workspaceId=${encodeURIComponent(workspaceId)}`, {
            method: "PATCH",
            body: JSON.stringify({ pointsResetPeriod }),
        });
    },
};
