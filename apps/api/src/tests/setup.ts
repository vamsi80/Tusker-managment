import { vi } from "vitest";

// The API talks to the database only through @tusker/core services; routes are
// tested against a mocked client. Keep the real exports (Prisma enums) intact.
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
        attendance: mockModel("attendance"),
        tag: mockModel("tag"),
        $transaction: vi.fn(async (cb: any) => {
            if (typeof cb === "function") return await cb(prismaMock);
            return Array.isArray(cb) ? await Promise.all(cb) : cb;
        }),
    };

    return { ...actual, default: prismaMock };
});
