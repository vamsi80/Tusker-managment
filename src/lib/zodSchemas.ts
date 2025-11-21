
import { z } from 'zod'

export const CourseLevel = ["Biginner", "Intermediate", "Advance"] as const

export const CourseStatus = ["Draft", "Published", "Archive"] as const

export const CourseCategories = [
    'Development',
    'Busincess',
    'Finance',
    'It & Software',
    'Office Productivity',
    'Personal Development',
    'Design',
    'Music ',
    'Health & Fitness',
    'Teaching & Academics'
] as const

export const ProjectPriority = ["LOW", "MEDIUM", "HIGH"] as const

export const ProjectStatus = ["ACTIVE", "PLANNING", "COMPLETED", "ON_HOLD", "CANCELLED"] as const

export const courseSchema = z.object({
    title: z
        .string()
        .min(3, { message: "Title must be at least 3 charcters long" })
        .max(100, { message: "Title must be at most 100 character long" }),
    description: z
        .string()
        .min(3, { message: "description must be at least 3 charcters long" }),
    fileKey: z
        .string()
        .min(1, { message: "File is Required" }),
    price: z
        .coerce.number()
        .min(1, { message: "Price must be a positive number" }),
    duration: z
        .coerce.number()
        .min(1, { message: "duration must be at least 3 hour" })
        .max(500, { message: "duration must be at most 500 hour" }),
    level: z
        .enum(CourseLevel, { message: "level is Required" }),
    category: z
        .enum(CourseCategories, { message: "level is Required" }),
    smallDescription: z
        .string()
        .min(3, { message: "small Descreption must be at least 3 charcters long" })
        .max(200, { message: "small escreption must be at most 200 character long" }),
    slug: z
        .string()
        .min(3, { message: "slug must be at least 3 charcters long" }),
    status: z
        .enum(CourseStatus, { message: "status is Required" }),
});

export const workSpaceSchema = z.object({
    name: z
        .string()
        .min(3, { message: "Name must be at least 3 charcters long" })
        .max(100, { message: "Name must be at most 100 character long" }),
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
    fileKey: z
        .string()
        .min(1, { message: "File is Required" }),
    priority: z
        .enum(ProjectPriority, { message: "Priority is Required" }),

    status: z
        .enum(ProjectStatus, { message: "Status is Required" }),

    teteam_lead: z
        .string()
        .min(3, { message: "Team Lead is Required" }),
    workspaceId: z
        .string(),
    memberAccess: z.array(z.string()).optional(),
});

export const chapterSchema = z.object({
    name: z
        .string()
        .min(3, { message: "Title must be at least 3 charcters long" })
        .max(100, { message: "Title must be at most 100 character long" }),
    courseId: z.string().uuid({ message: "Invalid course id" }),
    // duration: z
    //     .coerce.number()
    //     .min(1, { message: "duration must be at least 3 hour" })
    //     .max(500, { message: "duration must be at most 500 hour" }),
    // position: z
    //     .coerce.number()
    //     .min(1, { message: "position must be at least 1" })
    //     .max(500, { message: "position must be at most 500" }),
});

export const lessonSchema = z.object({
    name: z
        .string()
        .min(3, { message: "Title must be at least 3 charcters long" })
        .max(100, { message: "Title must be at most 100 character long" }),
    courseId: z.string().uuid({ message: "Invalid course id" }),
    chapterId: z.string().uuid({ message: "Invalid chapter id" }),
    description: z
        .string()
        .min(3, { message: "description must be at least 3 charcters long" })
        .optional(),
    thumbnailKey: z
        .string().optional(),
    videoKey: z
        .string().optional(),
});

export type CourseSchemaType = z.infer<typeof courseSchema>;
export type WorkSpaceSchemaType = z.infer<typeof workSpaceSchema>;
export type ProjectSchemaType = z.infer<typeof projectSchema>;
export type ChapterSchemaType = z.infer<typeof chapterSchema>;
export type LessonSchemaType = z.infer<typeof lessonSchema>;
