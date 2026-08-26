import { apiFetch } from "./fetch-wrapper";

/**
 * Procurement API Client
 *
 * Every procurement endpoint is workspace-scoped through the `w` query
 * parameter, so it is threaded through here rather than repeated at each
 * call site.
 */

type Json = Record<string, unknown>;

const ws = (workspaceId: string, extra?: Record<string, string | undefined>) => {
    const params = new URLSearchParams({ w: workspaceId });
    for (const [k, v] of Object.entries(extra ?? {})) {
        if (v !== undefined) params.set(k, v);
    }
    return `?${params.toString()}`;
};

const post = (path: string, body?: unknown) =>
    apiFetch<{ success: boolean; data?: any; error?: string }>(path, {
        method: "POST",
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });

const patch = (path: string, body?: unknown) =>
    apiFetch<{ success: boolean; data?: any; error?: string }>(path, {
        method: "PATCH",
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });

export const procurementClient = {
    indents: {
        list: (workspaceId: string) =>
            apiFetch<{ success: boolean; data: any[] }>(`/procurement/indents${ws(workspaceId)}`),

        get: (workspaceId: string, indentId: string) =>
            apiFetch<{ success: boolean; data: any }>(`/procurement/indents/${indentId}${ws(workspaceId)}`),

        create: (workspaceId: string, values: Json) =>
            post(`/procurement/indents${ws(workspaceId)}`, values),

        update: (workspaceId: string, indentId: string, values: Json) =>
            patch(`/procurement/indents/${indentId}${ws(workspaceId)}`, values),

        submit: (workspaceId: string, indentId: string, values?: Json) =>
            post(`/procurement/indents/${indentId}/submit${ws(workspaceId)}`, values),

        approve: (workspaceId: string, indentId: string, values?: Json) =>
            post(`/procurement/indents/${indentId}/approve${ws(workspaceId)}`, values),

        reject: (workspaceId: string, indentId: string, values?: Json) =>
            post(`/procurement/indents/${indentId}/reject${ws(workspaceId)}`, values),

        cancel: (workspaceId: string, indentId: string, values?: Json) =>
            post(`/procurement/indents/${indentId}/cancel${ws(workspaceId)}`, values),

        resubmit: (workspaceId: string, indentId: string, values?: Json) =>
            post(`/procurement/indents/${indentId}/resubmit${ws(workspaceId)}`, values),

        finalRates: (workspaceId: string, indentId: string, values: Json) =>
            post(`/procurement/indents/${indentId}/final-rates${ws(workspaceId)}`, values),

        items: (workspaceId: string, indentId: string) =>
            apiFetch<{ success: boolean; data: any[] }>(`/procurement/indents/${indentId}/items${ws(workspaceId)}`),

        lineItems: (workspaceId: string, filters?: { projectId?: string; status?: string }) =>
            apiFetch<{ success: boolean; data: any[] }>(
                `/procurement/indents/line-items${ws(workspaceId, {
                    projectId: filters?.projectId,
                    status: filters?.status,
                })}`
            ),

        units: (workspaceId: string) =>
            apiFetch<{ success: boolean; data: any[] }>(`/procurement/indents/units${ws(workspaceId)}`),

        projectTasks: (workspaceId: string, projectId: string) =>
            apiFetch<{ success: boolean; data: any[] }>(
                `/procurement/indents/projects/${projectId}/tasks${ws(workspaceId)}`
            ),
    },

    rfq: {
        send: (workspaceId: string, values: Json) =>
            post(`/procurement/rfq/send${ws(workspaceId)}`, values),

        quotes: (workspaceId: string) =>
            apiFetch<{ success: boolean; data: any[] }>(`/procurement/rfq/quotes${ws(workspaceId)}`),

        submitQuotes: (workspaceId: string, values: Json) =>
            post(`/procurement/rfq/quotes${ws(workspaceId)}`, values),

        itemQuotes: (workspaceId: string, itemId: string) =>
            apiFetch<{ success: boolean; data: any[] }>(
                `/procurement/rfq/items/${itemId}/quotes${ws(workspaceId)}`
            ),

        suggestedVendors: (workspaceId: string, itemId: string) =>
            apiFetch<{ success: boolean; data: any[] }>(
                `/procurement/rfq/items/${itemId}/suggested-vendors${ws(workspaceId)}`
            ),

        approveQuote: (workspaceId: string, quoteId: string, values?: Json) =>
            post(`/procurement/rfq/quotes/${quoteId}/approve${ws(workspaceId)}`, values),

        rejectQuote: (workspaceId: string, quoteId: string, values?: Json) =>
            post(`/procurement/rfq/quotes/${quoteId}/reject${ws(workspaceId)}`, values),
    },

    vendors: {
        get: (workspaceId: string, vendorId: string) =>
            apiFetch<{ success: boolean; data: any }>(`/procurement/vendors/${vendorId}${ws(workspaceId)}`),

        update: (workspaceId: string, vendorId: string, values: Json) =>
            patch(`/procurement/vendors/${vendorId}${ws(workspaceId)}`, values),

        /** `permanent` hard-deletes instead of archiving. */
        remove: (workspaceId: string, vendorId: string, permanent = false) =>
            apiFetch<{ success: boolean }>(
                `/procurement/vendors/${vendorId}${ws(workspaceId, {
                    permanent: permanent ? "true" : undefined,
                })}`,
                { method: "DELETE" }
            ),

        capabilities: (workspaceId: string, vendorId: string) =>
            apiFetch<{ success: boolean; data: any[] }>(
                `/procurement/vendors/${vendorId}/capabilities${ws(workspaceId)}`
            ),

        addCapability: (workspaceId: string, vendorId: string, values: Json) =>
            post(`/procurement/vendors/${vendorId}/capabilities${ws(workspaceId)}`, values),

        removeCapability: (workspaceId: string, vendorId: string, capabilityId: string) =>
            apiFetch<{ success: boolean }>(
                `/procurement/vendors/${vendorId}/capabilities/${capabilityId}${ws(workspaceId)}`,
                { method: "DELETE" }
            ),

        quotationMapping: (workspaceId: string, vendorId: string, values: Json) =>
            post(`/procurement/vendors/${vendorId}/quotation-mapping${ws(workspaceId)}`, values),

        materialCoverage: (workspaceId: string) =>
            apiFetch<{ success: boolean; data: any }>(
                `/procurement/vendors/materials/coverage${ws(workspaceId)}`
            ),
    },

    materials: {
        list: (workspaceId: string) =>
            apiFetch<{ success: boolean; data: any[] }>(`/materials${ws(workspaceId)}`),

        create: (workspaceId: string, values: Json) =>
            post(`/materials${ws(workspaceId)}`, values),
    },
};
