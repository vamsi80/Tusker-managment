import { api, request } from "./client";

/**
 * Procurement: indents, line items, RFQs, quotes, purchase orders, vendors and
 * the material catalogue. Every route reads the workspace from `?w=`.
 */

export type IndentLineItemInput = {
    materialCatalogId?: string;
    materialName: string;
    unit: string;
    quantity: number;
    estimatedUnitPrice?: number;
    specifications?: string | null;
};

export const indentsApi = {
    list: (w: string) => api.get<any[]>("/procurement/indents", { w }),
    get: (w: string, id: string) => api.get<any>(`/procurement/indents/${id}`, { w }),
    byTask: (w: string, taskId: string) => api.get<any>(`/procurement/indents/task/${taskId}`, { w }),
    lineItems: (w: string, f: { status?: string[]; projectId?: string[] } = {}) =>
        api.get<any[]>("/procurement/indents/line-items", {
            w,
            status: f.status?.length ? JSON.stringify(f.status) : undefined,
            projectId: f.projectId?.length ? JSON.stringify(f.projectId) : undefined,
        }),
    units: (w: string) => api.get<any[]>("/procurement/indents/units", { w }),
    procurableTasks: (w: string, projectId: string) => api.get<any[]>(`/procurement/indents/projects/${projectId}/tasks`, { w }),
    procurableProjects: (workspaceId: string) => api.get<any[]>("/procurement/procurable-projects", { workspaceId }),

    create: (input: {
        workspaceId: string;
        name?: string;
        description?: string;
        projectId?: string | null;
        taskId?: string | null;
        raisedInProject?: boolean;
        expectedDelivery?: string;
        taxPercent?: number;
        exciseDutyPercent?: number;
        vatPercent?: number;
        transportCharge?: number;
        labourCharge?: number;
        lineItems?: IndentLineItemInput[];
        approverIds: string[];
    }) => api.post<any>("/procurement/indents", input),
    update: (w: string, id: string, input: Record<string, any>) => api.patch<any>(`/procurement/indents/${id}`, input, { w }),
    remove: (w: string, id: string) => request(`/procurement/indents/${id}`, { method: "DELETE", query: { w } }),
    submit: (w: string, id: string) => api.post<any>(`/procurement/indents/${id}/submit`, {}, { w }),
    assign: (w: string, id: string, assigneeId: string) => api.post<any>(`/procurement/indents/${id}/assign`, { assigneeId }, { w }),
    approve: (w: string, id: string) => api.post<any>(`/procurement/indents/${id}/approve`, {}, { w }),
    reject: (w: string, id: string, reason: string) => api.post<any>(`/procurement/indents/${id}/reject`, { reason }, { w }),
    resubmit: (w: string, id: string) => api.post<any>(`/procurement/indents/${id}/resubmit`, {}, { w }),
    cancel: (w: string, id: string, reason: string) => request(`/procurement/indents/${id}/cancel`, { method: "POST", body: { reason }, query: { w } }),
    submitFinalRates: (w: string, id: string, rates: { itemId: string; finalUnitPrice: number }[], vendorId?: string) =>
        api.post<any>(`/procurement/indents/${id}/final-rates`, { rates, vendorId }, { w }),
    addItem: (w: string, id: string, item: IndentLineItemInput) => api.post<any>(`/procurement/indents/${id}/items`, item, { w }),
    updateItem: (w: string, id: string, itemId: string, item: Record<string, any>) =>
        api.patch<any>(`/procurement/indents/${id}/items/${itemId}`, item, { w }),
    removeItem: (w: string, id: string, itemId: string) => request(`/procurement/indents/${id}/items/${itemId}`, { method: "DELETE", query: { w } }),
    suggestedVendors: (w: string, id: string, itemId: string) => api.get<any[]>(`/procurement/indents/${id}/items/${itemId}/suggested-vendors`, { w }),
};

export const rfqApi = {
    quotes: (w: string, lineItemId: string) => api.get<any[]>(`/procurement/rfq/items/${lineItemId}/quotes`, { w }),
    suggestedVendors: (w: string, lineItemId: string) => api.get<any[]>(`/procurement/rfq/items/${lineItemId}/suggested-vendors`, { w }),
    send: (w: string, input: { lineItemId: string; vendorIds: string[]; deadline: string }) => api.post("/procurement/rfq/send", input, { w }),
    submitQuote: (
        w: string,
        input: { lineItemId: string; vendorId: string; unitPrice: number; quantity: number; leadTimeDays?: number; validUntil?: string; notes?: string },
    ) => api.post("/procurement/rfq/quotes", input, { w }),
    approveQuote: (w: string, quoteId: string) => api.post(`/procurement/rfq/quotes/${quoteId}/approve`, {}, { w }),
    rejectQuote: (w: string, quoteId: string, reason: string) => api.post(`/procurement/rfq/quotes/${quoteId}/reject`, { reason }, { w }),
};

export const purchaseOrdersApi = {
    list: (w: string) => api.get<any[]>("/procurement/purchase-orders", { w }),
    get: (w: string, id: string) => api.get<any>(`/procurement/purchase-orders/${id}`, { w }),
    create: (input: {
        workspaceId: string;
        company: "WT" | "PL";
        vendorId: string;
        indentId: string;
        referenceNo?: string | null;
        poDate?: string;
        deliveryAddress: string;
        exciseDutyPercent?: number | null;
        vatPercent?: number | null;
        transportCharge?: number | null;
        labourCharge?: number | null;
        terms?: string[];
        notes?: string | null;
        items: { description: string; unit: string; quantity: number; rate: number; taxPercent: number }[];
    }) => api.post<any>("/procurement/purchase-orders", input),
};

export type VendorInput = {
    name?: string | null;
    companyName?: string | null;
    contactPerson?: string | null;
    email?: string | null;
    address?: string | null;
    addressLine1?: string | null;
    addressLine2?: string | null;
    city?: string | null;
    state?: string | null;
    pincode?: string | null;
    country?: string | null;
    hasGst?: boolean;
    gstNumber?: string | null;
    phoneNumber?: string | null;
    gstStatus?: string | null;
    taxpayerType?: string | null;
    businessConstitution?: string | null;
    gstRegistrationDate?: string | null;
    gstCancellationDate?: string | null;
    stateJurisdiction?: string | null;
    natureOfBusiness?: string | null;
    blockStatus?: string | null;
    einvoiceStatus?: string | null;
    status?: "ACTIVE" | "BLACKLISTED";
};

export const vendorsApi = {
    list: (w: string, p: { search?: string; status?: string } = {}) => api.get<any[]>("/procurement/vendors", { w, ...p }),
    get: (w: string, id: string) => api.get<any>(`/procurement/vendors/${id}`, { w }),
    create: (workspaceId: string, input: VendorInput) => api.post<any>("/procurement/vendors", { workspaceId, ...input }),
    update: (w: string, id: string, input: VendorInput) => api.patch<any>(`/procurement/vendors/${id}`, input, { w }),
    blacklist: (w: string, id: string) => api.del(`/procurement/vendors/${id}`, undefined, { w }),
    deletePermanently: (w: string, id: string) => api.del(`/procurement/vendors/${id}`, undefined, { w, permanent: "true" }),
    lookupGstin: (workspaceId: string, gstin: string) => api.post<any>("/procurement/vendors/gstin/lookup", { workspaceId, gstin }),
    coverage: (w: string) => api.get<any[]>("/procurement/vendors/materials/coverage", { w }),
    materials: (w: string, id: string) => api.get<any[]>(`/procurement/vendors/${id}/materials`, { w }),
    capabilities: (w: string, id: string) => api.get<any[]>(`/procurement/vendors/${id}/capabilities`, { w }),
    addCapability: (w: string, id: string, input: { materialName: string; unit?: string; serviceType?: string; rate?: number | null; quantity?: number | null; link?: string | null }) =>
        api.post(`/procurement/vendors/${id}/capabilities`, input, { w }),
    updateCapability: (w: string, id: string, capId: string, input: Record<string, any>) =>
        api.patch(`/procurement/vendors/${id}/capabilities/${capId}`, input, { w }),
    removeCapability: (w: string, id: string, capId: string) => api.del(`/procurement/vendors/${id}/capabilities/${capId}`, undefined, { w }),
};

export const materialsApi = {
    /** Workspace material catalogue with last known price and vendor. */
    list: (w: string) => api.get<any[]>("/materials", { w }),
    create: (workspaceId: string, input: { name: string; unit?: string }) => api.post("/materials", { workspaceId, ...input }),
    update: (w: string, id: string, input: { name?: string; unit?: string | null }) => api.patch(`/materials/${id}`, input, { w }),
    remove: (w: string, id: string) => api.del(`/materials/${id}`, undefined, { w }),
};
