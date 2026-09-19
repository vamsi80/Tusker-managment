import { describe, expect, it, vi, beforeEach } from "vitest";
import { generateUniqueSlug, generateUniqueSlugs } from "../slug-generator";
import { projectSchema } from "../zodSchemas";

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
