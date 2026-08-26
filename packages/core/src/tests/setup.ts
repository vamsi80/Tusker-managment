import { vi } from "vitest";

// Mirror of the web app's Prisma mock. @tusker/db also re-exports the generated
// enums, so keep the real module's exports and swap out only the client.
vi.mock("@tusker/db", async (importOriginal) => {
    const actual = await importOriginal<Record<string, unknown>>();
    const mockModel = (name: string) => ({
        count: vi.fn(),
        findUnique: vi.fn(),
        create: vi.fn(async (args: any) => ({ id: `mock-${name}-id`, ...args?.data })),
        update: vi.fn(async (args: any) => ({ id: args?.where?.id || `mock-${name}-id`, ...args?.data })),
        delete: vi.fn(async (args: any) => ({ id: args?.where?.id || `mock-${name}-id` })),
        findFirst: vi.fn(),
        findMany: vi.fn(() => []),
        upsert: vi.fn(async (args: any) => ({ id: args?.where?.id || `mock-${name}-id`, ...args?.create })),
        deleteMany: vi.fn(() => ({ count: 0 })),
    });

    const prismaMock: Record<string, unknown> = {
        user: mockModel("user"),
        workspaceMember: mockModel("workspaceMember"),
        workspace: mockModel("workspace"),
        project: mockModel("project"),
        projectMember: mockModel("projectMember"),
        task: mockModel("task"),
        tag: mockModel("tag"),
        board: mockModel("board"),
        dailyReport: mockModel("dailyReport"),
        comment: mockModel("comment"),
        $transaction: vi.fn(async (cb: any) => {
            if (typeof cb === "function") return await cb(prismaMock);
            return Array.isArray(cb) ? await Promise.all(cb) : cb;
        }),
    };

    return { ...actual, default: prismaMock };
});
