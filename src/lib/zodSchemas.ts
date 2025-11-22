
import { z } from 'zod'

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
    workspaceId: z
        .string().optional(),
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

export type WorkSpaceSchemaType = z.infer<typeof workSpaceSchema>;
export type ProjectSchemaType = z.infer<typeof projectSchema>;
export type ChapterSchemaType = z.infer<typeof chapterSchema>;
export type LessonSchemaType = z.infer<typeof lessonSchema>;
