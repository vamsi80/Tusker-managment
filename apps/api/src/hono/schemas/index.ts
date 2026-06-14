import { z } from "zod";
import { BoardStatus } from "@/generated/prisma";

/**
 * Centralized request-validation schemas for the Hono API routes.
 *
 * These are SERVER-ONLY validators (some reference Prisma enums) and are kept
 * here rather than in `@tusker/shared/schemas` so the web bundle stays free of
 * Prisma coupling. Cross-cutting form schemas shared with the web app continue
 * to live in `@tusker/shared/schemas`.
 *
 * Trivial one-field anonymous validators remain inline at their single call site.
 */

// ── Tags (tags.ts) ──────────────────────────────────────────────────────────
export const createTagSchema = z.object({
    name: z.string().min(1).max(50),
    requirePurchase: z.boolean().default(false),
    workspaceId: z.string(),
    projectId: z.string().optional(),
});

export const updateTagSchema = z.object({
    tagId: z.string(),
    workspaceId: z.string(),
    name: z.string().min(1).max(50).optional(),
    requirePurchase: z.boolean().optional(),
});

// ── Board (board.ts) ────────────────────────────────────────────────────────
export const createBoardItemSchema = z.object({
    workspaceId: z.string(),
    memberId: z.string(),
    note: z.string().min(1),
});

export const toggleBoardItemStatusSchema = z.object({
    workspaceId: z.string(),
    currentStatus: z.nativeEnum(BoardStatus),
});

// ── Tasks (tasks.ts) ────────────────────────────────────────────────────────
export const patchTaskFieldsSchema = z.object({
    workspaceId: z.string(),
    projectId: z.string(),
    startDate: z.string().optional().nullable(),
    dueDate: z.string().optional().nullable(),
    assigneeUserId: z.string().optional().nullable(),
    tagIds: z.array(z.string()).optional(),
});

// ── Project materials (project-materials.ts) ────────────────────────────────
export const CreateMaterialItemSchema = z.object({
    subtaskId: z.string().nullable().optional(),
    materialName: z.string().min(1, "Material name is required"),
    unit: z.string().min(1, "Unit of measure is required"),
    quantity: z.number().positive("Quantity must be greater than zero"),
    notes: z.string().nullable().optional(),
});

export const UpdateMaterialItemSchema = z.object({
    subtaskId: z.string().nullable().optional(),
    materialName: z.string().min(1).optional(),
    unit: z.string().min(1).optional(),
    quantity: z.number().positive().optional(),
    notes: z.string().nullable().optional(),
});

// ── Procurement: vendors (procurement-vendors.ts) ───────────────────────────
export const CreateVendorSchema = z.object({
    workspaceId: z.string(),
    name: z.string().min(2),
    companyName: z.string().optional(),
    contactPerson: z.string().optional(),
    email: z.string().email().optional().or(z.literal("")),
    address: z.string().optional(),
    addressLine1: z.string().optional().or(z.literal("")),
    addressLine2: z.string().optional().or(z.literal("")),
    city: z.string().optional().or(z.literal("")),
    state: z.string().optional().or(z.literal("")),
    pincode: z.string().optional().or(z.literal("")),
    country: z.string().optional().default("India"),
    gstNumber: z.string().regex(/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/, "Invalid GST Format").optional().or(z.literal("")),
    phoneNumber: z.string().optional(),
});

export const UpdateVendorSchema = CreateVendorSchema.omit({ workspaceId: true }).partial();

// ── Procurement: RFQ (procurement-rfq.ts) ───────────────────────────────────
export const SendRfqSchema = z.object({
    lineItemId: z.string(),
    vendorIds: z.array(z.string()).min(1, "At least one vendor required"),
    deadline: z.string(), // ISO date string
});

export const SubmitQuoteSchema = z.object({
    lineItemId: z.string(),
    vendorId: z.string(),
    unitPrice: z.number().positive(),
    quantity: z.number().int().positive(),
    leadTimeDays: z.number().int().positive().optional(),
    validUntil: z.string().optional(), // ISO date
    notes: z.string().optional(),
    attachmentUrl: z.string().url().optional(),
});

export const RejectQuoteSchema = z.object({
    reason: z.string().min(1),
});

// ── Procurement: indents (procurement-indents.ts) ───────────────────────────
export const CreateIndentSchema = z.object({
    taskId: z.string().optional().nullable(),
    projectId: z.string(),
    workspaceId: z.string(),
    name: z.string().min(1),
    description: z.string().optional(),
    expectedDelivery: z.string().optional(),
    lineItems: z.array(
        z.object({
            materialName: z.string().min(1),
            unit: z.string().min(1),
            quantity: z.number().int().positive(),
            estimatedUnitPrice: z.number().int().positive().optional(),
            specifications: z.string().nullable().optional(),
        })
    ).optional(),
});

export const AddLineItemSchema = z.object({
    materialName: z.string().min(1),
    unit: z.string().min(1),
    quantity: z.number().int().positive(),
    estimatedUnitPrice: z.number().int().positive().optional(),
    specifications: z.string().nullable().optional(),
});

export const UpdateLineItemSchema = z.object({
    materialName: z.string().min(1).optional(),
    unit: z.string().min(1).optional(),
    quantity: z.number().int().positive().optional(),
    estimatedUnitPrice: z.number().int().positive().optional(),
    specifications: z.string().nullable().optional(),
});

export const CancelIndentSchema = z.object({
    reason: z.string().min(1),
});

export const AssignIndentSchema = z.object({
    assigneeId: z.string(),
});
