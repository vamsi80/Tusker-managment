import { z } from 'zod'

export const SubTaskStatus = ["TO_DO", "IN_PROGRESS", "BLOCKED", "REVIEW", "COMPLETED", "HOLD"] as const

// Status labels - single source of truth
export const STATUS_LABELS: Record<typeof SubTaskStatus[number], string> = {
    TO_DO: "To Do",
    IN_PROGRESS: "In Progress",
    BLOCKED: "Blocked",
    REVIEW: "Review",
    COMPLETED: "Completed",
    HOLD: "On Hold",
} as const;

// Status options for dropdowns
export const STATUS_OPTIONS = SubTaskStatus.map(value => ({
    value,
    label: STATUS_LABELS[value]
}));



export const workspaceMemberRole = ["OWNER", "ADMIN", "MEMBER", "VIEWER"] as const

export const projectRole = ["LEAD", "MEMBER", "VIEWER"] as const

export const unitCategories = ["Weight", "Length", "Volume", "Area", "Quantity", "Time"] as const;

export const inviteUserSchema = z.object({
    name: z
        .string()
        .min(3, { message: "Name must be at least 3 charcters long" })
        .max(100, { message: "Name must be at most 100 character long" }),
    niceName: z
        .string()
        .min(1, { message: "Name must be at least 1 charcters long" })
        .max(100, { message: "Name must be at most 100 character long" }),
    email: z
        .string()
        .min(3, { message: "Email must be at least 3 charcters long" })
        .max(100, { message: "Email must be at most 100 character long" }),
    contactNumber: z
        .string()
        .min(10, { message: "Contact Number must be at least 10 charcters long" })
        .max(15, { message: "Contact Number must be at most 15 character long" }),
    password: z
        .string()
        .min(8, "Password must be at least 8 characters")
        .regex(
            /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/,
            "Password must contain at least one uppercase letter, one lowercase letter, and one number"
        ),
    role: z.enum(workspaceMemberRole, { message: "Role is required" }),
    workspaceId: z.string().uuid({ message: "Invalid workspace id" }),
});

export const workSpaceSchema = z.object({
    name: z
        .string()
        .min(3, { message: "Name must be at least 3 charcters long" })
        .max(100, { message: "Name must be at most 100 character long" }),
    slug: z
        .string()
        .min(3, { message: "Slug must be at least 3 charcters long" })
        .max(50, { message: "Slug must be at most 50 character long" }),
    description: z
        .string()
        .min(3, { message: "description must be at least 3 charcters long" }),
});

export const projectSchema = z.object({
    name: z
        .string()
        .min(3, { message: "Name must be at least 3 charcters long" })
        .max(100, { message: "Name must be at most 100 character long" }),
    description: z
        .string()
        .min(3, { message: "description must be at least 3 charcters long" }),
    slug: z
        .string()
        .min(3, { message: "Slug must be at least 3 charcters long" })
        .max(50, { message: "Slug must be at most 50 character long" }),
    companyName: z
        .string()
        .min(3, { message: "Company Name must be at least 3 charcters long" })
        .max(100, { message: "Company Name must be at most 100 character long" }),
    registeredCompanyName: z
        .string()
        .min(3, { message: "Registered Company Name must be at least 3 charcters long" })
        .max(100, { message: "Registered Company Name must be at most 100 character long" }),
    directorName: z
        .string()
        .min(3, { message: "Location must be at least 3 charcters long" })
        .max(100, { message: "Location must be at most 100 character long" })
        .optional(),
    address: z
        .string()
        .min(3, { message: "Address must be at least 3 charcters long" })
        .max(150, { message: "Address Name must be at most 150 character long" })
        .optional(),
    gstNumber: z
        .string()
        .max(15, { message: "GST is usually 15 characters — alphanumeric." })
        .max(15, { message: "GST is usually 15 characters — alphanumeric." }),
    contactPerson: z
        .string()
        .min(3, { message: "Contact Person must be at least 3 charcters long" })
        .max(100, { message: "Contact Person must be at most 100 character long" }),
    contactNumber: z
        .string()
        .min(10, { message: "Contact Number must be at least 10 charcters long" })
        .max(15, { message: "Contact Number must be at most 15 character long" }),
    workspaceId: z
        .string().optional(),
    projectLead: z.string().min(1, { message: "Project lead is required. Please select a team member." }),
    memberAccess: z.array(z.string()),
});

export const editProjectSchema = z.object({
    projectId: z.string().uuid({ message: "Invalid project id" }),
    name: z
        .string()
        .min(3, { message: "Name must be at least 3 characters long" })
        .max(100, { message: "Name must be at most 100 characters long" }),
    description: z
        .string()
        .min(3, { message: "Description must be at least 3 characters long" })
        .optional(),
    slug: z
        .string()
        .min(3, { message: "Slug must be at least 3 characters long" })
        .max(50, { message: "Slug must be at most 50 characters long" })
        .optional(),
    // Client/Company fields
    companyName: z
        .string()
        .min(3, { message: "Company Name must be at least 3 characters long" })
        .max(100, { message: "Company Name must be at most 100 characters long" })
        .optional(),
    registeredCompanyName: z
        .string()
        .min(3, { message: "Registered Company Name must be at least 3 characters long" })
        .max(100, { message: "Registered Company Name must be at most 100 characters long" })
        .optional(),
    directorName: z
        .string()
        .min(3, { message: "Director Name must be at least 3 characters long" })
        .max(100, { message: "Director Name must be at most 100 characters long" })
        .optional(),
    address: z
        .string()
        .min(3, { message: "Address must be at least 3 characters long" })
        .max(150, { message: "Address must be at most 150 characters long" })
        .optional(),
    gstNumber: z
        .string()
        .max(15, { message: "GST is usually 15 characters — alphanumeric." })
        .optional(),
    contactPerson: z
        .string()
        .min(3, { message: "Contact Person must be at least 3 characters long" })
        .max(100, { message: "Contact Person must be at most 100 characters long" })
        .optional(),
    contactNumber: z
        .string()
        .min(10, { message: "Contact Number must be at least 10 characters long" })
        .max(15, { message: "Contact Number must be at most 15 characters long" })
        .optional(),
    // Team fields
    projectLead: z.string().optional(),
    memberAccess: z.array(z.string()).optional(),
});

export const taskSchema = z.object({
    name: z
        .string()
        .min(3, { message: "Title must be at least 3 charcters long" })
        .max(100, { message: "Title must be at most 100 character long" }),
    taskSlug: z
        .string()
        .min(3, { message: "Title must be at least 3 charcters long" })
        .max(100, { message: "Title must be at most 100 character long" }),
    projectId: z.string().uuid({ message: "Invalid project id" }),
});

export const subTaskSchema = z.object({
    name: z
        .string()
        .min(3, { message: "Title must be at least 3 charcters long" })
        .max(100, { message: "Title must be at most 100 character long" }),
    description: z
        .string()
        .min(3, { message: "description must be at least 3 charcters long" })
        .optional(),
    taskSlug: z
        .string()
        .min(3, { message: "Title must be at least 3 charcters long" })
        .max(100, { message: "Title must be at most 100 character long" }),
    status: z
        .enum(SubTaskStatus, { message: "status is Required" }),
    assignee: z
        .string()
        .min(3, { message: "At least task should assign to one person" })
        .optional(),
    startDate: z
        .string()
        .min(3, { message: "Due date should select" })
        .optional(),
    days: z
        .number()
        .min(1, { message: "Days should be at least 1" })
        .optional(),
    tag: z
        .string()
        .uuid({ message: "Invalid tag id" })
        .optional(),
    projectId: z.string().uuid({ message: "Invalid project id" }),
    parentTaskId: z.string().uuid({ message: "Invalid parent task id" }),
});

export const unitSchema = z.object({
    name: z
        .string()
        .min(1, { message: "Unit name is required" })
        .max(50, { message: "Unit name must be at most 50 characters long" }),
    abbreviation: z
        .string()
        .min(1, { message: "Abbreviation is required" })
        .max(10, { message: "Abbreviation must be at most 10 characters long" }),
    category: z
        .enum(unitCategories, { message: "Please select a valid category" })
        .optional(),
    isDefault: z.boolean().default(false).optional(),
    isActive: z.boolean().default(true).optional(),
});

export const materialSchema = z.object({
    name: z
        .string()
        .min(3, { message: "Material name must be at least 3 characters long" })
        .max(100, { message: "Material name must be at most 100 characters long" }),
    specifications: z
        .string()
        .max(500, { message: "Specifications must be at most 500 characters long" })
        .optional()
        .nullable(),
    defaultUnitId: z
        .string()
        .uuid({ message: "Please select a valid unit" }),
    workspaceId: z
        .string()
        .uuid({ message: "Invalid workspace id" }),
    isActive: z.boolean().default(true).optional(),
});

export const vendorSchema = z.object({
    name: z
        .string()
        .min(2, { message: "Vendor name must be at least 2 characters long" })
        .max(100, { message: "Vendor name must be at most 100 characters long" }),
    companyName: z
        .string()
        .max(100, { message: "Company name must be at most 100 characters long" })
        .optional()
        .nullable(),
    contactPerson: z
        .string()
        .max(100, { message: "Contact person must be at most 100 characters long" })
        .optional()
        .nullable(),
    contactNumber: z
        .string()
        .max(20, { message: "Contact number must be at most 20 characters long" })
        .optional()
        .nullable(),
    email: z
        .string()
        .email({ message: "Invalid email address" })
        .optional()
        .nullable()
        .or(z.literal("")),
    address: z
        .string()
        .max(200, { message: "Address must be at most 200 characters long" })
        .optional()
        .nullable(),
    gstNumber: z
        .string()
        .max(20, { message: "GST number must be at most 20 characters long" })
        .optional()
        .nullable(),
    workspaceId: z
        .string()
        .uuid({ message: "Invalid workspace id" }),
    isActive: z.boolean().default(true).optional(),
    materialIds: z.array(z.string()).optional(),
});

export const indentSchema = z.object({
    name: z.string().min(1, "Indent name is required"),
    indentKey: z.string().min(1, "Indent key is required"), // You might generate this automatically, but for schema we'll include it or make optional
    projectId: z.string().optional().nullable(),
    description: z.string().optional(),
    requiredDate: z.date().optional().nullable(),
    procurementTaskId: z.string().optional().nullable(),
});

// Indent Request Schemas - Multi-step with validation
// Step 1: Basic Information Schema (All users)
export const indentStep1Schema = z.object({
    name: z.string().min(3, "Name must be at least 3 characters"),
    projectId: z.string().min(1, "Project is required"),
    taskId: z.string().optional(),
    description: z.string().optional(),
    expectedDelivery: z.date({ message: "Expected delivery date is required" }),
    requiresVendor: z.boolean(),
    assignedTo: z.string().min(1, "Assignee is required"),
    status: z.enum(["PENDING", "APPROVED", "REJECTED", "QUANTITY_APPROVED", "VENDOR_PENDING"]).optional(),
});

// Step 2: Material Item Schema with vendor/price validation
export const materialItemSchema = z.object({
    materialId: z.string().min(1, "Material is required"),
    quantity: z.number().min(0.01, "Quantity must be greater than 0"),
    unitId: z.string().optional(),
    vendorId: z.string().optional().nullable(),
    estimatedPrice: z.number().optional().nullable(),
    itemStatus: z.enum(["PENDING", "APPROVED", "REJECTED", "QUANTITY_APPROVED", "VENDOR_PENDING"]).optional(),
}).refine((data) => {
    // If vendor is selected, price must be provided and > 0
    if (data.vendorId && (!data.estimatedPrice || data.estimatedPrice <= 0)) {
        return false;
    }
    return true;
}, {
    message: "Price is required when vendor is selected",
    path: ["estimatedPrice"]
});

// Step 2: Material Selection Schema (Admin/Owner only)
export const indentStep2Schema = z.object({
    materials: z.array(materialItemSchema).min(1, "At least one material is required"),
});

// Combined schema for dialog (partial materials for step-by-step)
export const indentDialogSchema = indentStep1Schema.merge(indentStep2Schema.partial());

// Server action schema (requires all fields including workspaceId)
export const createIndentRequestSchema = z.object({
    workspaceId: z.string(),
    name: z.string().min(3, { message: "Name must be at least 3 characters long" }),
    projectId: z.string(),
    taskId: z.string().optional(),
    description: z.string().optional(),
    expectedDelivery: z.date(),
    materials: z.array(materialItemSchema).optional(),
    requiresVendor: z.boolean().default(true),
    assignedTo: z.string(),
    status: z.enum(["PENDING", "APPROVED", "REJECTED", "QUANTITY_APPROVED", "VENDOR_PENDING"]).optional(),
});

export const deleteIndentSchema = z.object({
    workspaceId: z.string(),
    indentId: z.string(),
});

export const editIndentSchema = createIndentRequestSchema.extend({
    indentId: z.string(),
});

export type InviteUserSchemaType = z.infer<typeof inviteUserSchema>;
export type WorkSpaceSchemaType = z.infer<typeof workSpaceSchema>;
export type ProjectSchemaType = z.infer<typeof projectSchema>;
export type EditProjectSchemaType = z.infer<typeof editProjectSchema>;
export type TaskSchemaType = z.infer<typeof taskSchema>;
export type SubTaskSchemaType = z.infer<typeof subTaskSchema>;
export type IndentSchemaType = z.infer<typeof indentSchema>;
export type UnitSchemaType = z.infer<typeof unitSchema>;
export type MaterialSchemaType = z.infer<typeof materialSchema>;
export type VendorSchemaType = z.infer<typeof vendorSchema>;
export type MaterialItemType = z.infer<typeof materialItemSchema>;
export type IndentStep1Data = z.infer<typeof indentStep1Schema>;
export type IndentStep2Data = z.infer<typeof indentStep2Schema>;
export type IndentDialogFormData = z.infer<typeof indentDialogSchema>;
export type CreateIndentRequestInput = z.infer<typeof createIndentRequestSchema>;
export type DeleteIndentInput = z.infer<typeof deleteIndentSchema>;
export type EditIndentInput = z.infer<typeof editIndentSchema>;
