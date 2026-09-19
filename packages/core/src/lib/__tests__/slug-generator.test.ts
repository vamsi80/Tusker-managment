import { describe, expect, it, vi, beforeEach } from "vitest";
import { generateUniqueSlug, generateUniqueSlugs } from "../slug-generator";
import { projectSchema, taskSchema, subTaskSchema } from "../zodSchemas";

// Mock @tusker/db prisma
vi.mock("@tusker/db", () => {
    return {
        default: {
            task: {
                findMany: vi.fn().mockResolvedValue([]),
                findFirst: vi.fn().mockResolvedValue(null),
            },
            project: {
                findMany: vi.fn().mockImplementation(({ where }: any) => {
                    const prefix = where?.slug?.startsWith || "";
                    if (prefix === "existing-project") {
                        return [{ slug: "existing-project" }, { slug: "existing-project-1" }];
                    }
                    return [];
                }),
                findFirst: vi.fn().mockResolvedValue(null),
            },
            workspace: {
                findMany: vi.fn().mockResolvedValue([]),
                findFirst: vi.fn().mockResolvedValue(null),
            },
        },
    };
});

describe("slug generator", () => {
    it("generates standard lowercase slug for normal names", async () => {
        const slug = await generateUniqueSlug("Foundation Work", "project");
        expect(slug).toBe("foundation-work");
    });

    it("clamps long names to prevent exceeding column/schema max length", async () => {
        const longName = "Residential and Commercial Complex Infrastructure Development Phase 1 Block B";
        const slug = await generateUniqueSlug(longName, "project");
        expect(slug.length).toBeLessThanOrEqual(50);
        expect(slug).not.toMatch(/-$/); // no trailing hyphen
    });

    it("handles short or symbol-only names gracefully with a valid fallback", async () => {
        const symbolSlug = await generateUniqueSlug("+++", "project");
        expect(symbolSlug.length).toBeGreaterThanOrEqual(3);
        expect(symbolSlug.length).toBeLessThanOrEqual(50);
        expect(symbolSlug).toMatch(/^project-/);

        const shortSlug = await generateUniqueSlug("AI", "project");
        expect(shortSlug.length).toBeGreaterThanOrEqual(2);
    });

    it("resolves collisions by appending incrementing counter", async () => {
        const slug = await generateUniqueSlug("Existing Project", "project");
        expect(slug).toBe("existing-project-2");
    });

    it("handles batch slug generation with conflict resolution", async () => {
        const slugs = await generateUniqueSlugs(["Alpha", "Alpha", "Beta"], "project");
        expect(slugs[0]).toBe("alpha");
        expect(slugs[1]).toBe("alpha-1");
        expect(slugs[2]).toBe("beta");
    });
});

describe("projectSchema slug & memberAccess validation", () => {
    const baseValid = {
        name: "Test Project",
        description: "Valid description for the project",
        category: "WHITE_TUSKER" as const,
    };

    it("allows omitting slug (optional)", () => {
        const result = projectSchema.safeParse(baseValid);
        expect(result.success).toBe(true);
        if (result.success) {
            expect(result.data.memberAccess).toEqual([]);
        }
    });

    it("allows empty string slug", () => {
        const result = projectSchema.safeParse({ ...baseValid, slug: "" });
        expect(result.success).toBe(true);
    });

    it("allows valid custom slug", () => {
        const result = projectSchema.safeParse({ ...baseValid, slug: "custom-slug" });
        expect(result.success).toBe(true);
        if (result.success) {
            expect(result.data.slug).toBe("custom-slug");
        }
    });
});

describe("taskSchema and subTaskSchema validation", () => {
    const validProjectId = "123e4567-e89b-12d3-a456-426614174000";
    const validParentTaskId = "123e4567-e89b-12d3-a456-426614174001";

    it("validates taskSchema with omitted taskSlug and defaults tagIds", () => {
        const result = taskSchema.safeParse({
            name: "Deploy Backend Service",
            projectId: validProjectId,
        });
        expect(result.success).toBe(true);
        if (result.success) {
            expect(result.data.tagIds).toBeUndefined();
            expect(result.data.taskSlug).toBeUndefined();
        }
    });

    it("validates taskSchema with empty or null taskSlug", () => {
        const emptySlugResult = taskSchema.safeParse({
            name: "Deploy Backend Service",
            projectId: validProjectId,
            taskSlug: "",
        });
        expect(emptySlugResult.success).toBe(true);

        const nullSlugResult = taskSchema.safeParse({
            name: "Deploy Backend Service",
            projectId: validProjectId,
            taskSlug: null,
        });
        expect(nullSlugResult.success).toBe(true);
    });

    it("validates subTaskSchema with minimal payload (empty strings tolerated)", () => {
        const result = subTaskSchema.safeParse({
            name: "Configure Environment Variables",
            projectId: validProjectId,
            parentTaskId: validParentTaskId,
            taskSlug: "",
            description: "",
            assignee: "",
            reviewerId: "",
        });
        expect(result.success).toBe(true);
        if (result.success) {
            expect(result.data.days).toBe(1);
            expect(result.data.status).toBe("TO_DO");
            expect(result.data.tagIds).toBeUndefined();
        }
    });

    it("validates subTaskSchema with omitted optional fields", () => {
        const result = subTaskSchema.safeParse({
            name: "Run Migration Script",
            projectId: validProjectId,
            parentTaskId: validParentTaskId,
        });
        expect(result.success).toBe(true);
    });
});

