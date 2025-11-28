
import { z } from 'zod'

export const SubTaskStatus = ["TO_DO", "IN_PROGRESS", "BLOCKED", "REVIEW", "DONE"] as const

export const SubTaskPriority = ["LOW", "MEDIUM", "HIGH", "URGENT"] as const

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
    projectLead: z.array(z.string()).optional(),
    memberAccess: z.array(z.string()).optional(),
});

export const taskSchema = z.object({
    name: z
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
    projectId: z.string().uuid({ message: "Invalid project id" }),
    taskId: z.string().uuid({ message: "Invalid task id" }),
    description: z
        .string()
        .min(3, { message: "description must be at least 3 charcters long" })
        .optional(),
    status: z
        .enum(SubTaskStatus, { message: "status is Required" }),
    priority: z
        .enum(SubTaskPriority, { message: "priority is Required" }),
    assignee: z
        .string()
        .min(3, { message: "At least task should assign to one person" })
        .optional(),
    dueDate: z
        .string()
        .min(3, { message: "Due date should select" })
        .optional(),
    startDate: z
        .string()
        .min(3, { message: "Start date should select" })
        .optional(),
});

export type WorkSpaceSchemaType = z.infer<typeof workSpaceSchema>;
export type ProjectSchemaType = z.infer<typeof projectSchema>;
export type TaskSchemaType = z.infer<typeof taskSchema>;
export type SubTaskSchemaType = z.infer<typeof subTaskSchema>;
