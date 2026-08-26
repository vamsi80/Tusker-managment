import { vi } from "vitest";

vi.mock("server-only", () => ({}));

// Mock Prisma models explicitly within the factory to avoid hoisting issues.
// @tusker/db also re-exports the generated enums (AttendanceStatus, WorkspaceRole,
// ...), so keep the real module's exports and swap out only the client instance.
vi.mock("@tusker/db", async (importOriginal) => {
    const actual = await importOriginal<Record<string, unknown>>();
    const mockModel = (name: string) => ({
        count: vi.fn(),
        findUnique: vi.fn(),
        create: vi.fn(async (args) => ({ id: `mock-${name}-id`, ...args?.data })),
        update: vi.fn(async (args) => ({ id: args?.where?.id || `mock-${name}-id`, ...args?.data })),
        delete: vi.fn(async (args) => ({ id: args?.where?.id || `mock-${name}-id` })),
        findFirst: vi.fn(),
        findMany: vi.fn(() => []),
        upsert: vi.fn(async (args) => ({ id: args?.where?.id || `mock-${name}-id`, ...args?.create })),
        deleteMany: vi.fn(() => ({ count: 0 })),
    });

    const prismaMock = {
        user: mockModel("user"),
        workspaceMember: mockModel("workspaceMember"),
        workspace: mockModel("workspace"),
        project: mockModel("project"),
        projectMember: mockModel("projectMember"),
        task: mockModel("task"),
        tag: mockModel("tag"),
        procurementTask: mockModel("procurementTask"),
        board: mockModel("board"),
        dailyReport: mockModel("dailyReport"),
        dailyReportEntry: {
            createMany: vi.fn(() => ({ count: 0 })),
        },
        comment: mockModel("comment"),
        $transaction: vi.fn(async (cb) => {
            if (typeof cb === 'function') {
                return await cb(prismaMock);
            }
            return Array.isArray(cb) ? await Promise.all(cb) : cb;
        }),
    };

    return {
        ...actual,
        default: prismaMock,
    };
});

// Mock Better Auth
vi.mock("@tusker/core/lib/auth", () => ({
    auth: {
        api: {
            getSession: vi.fn(),
            signUpEmail: vi.fn(),
            deleteUser: vi.fn(),
        },
    },
}));

// Mock Next.js Cache/Navigation
vi.mock("next/cache", () => ({
    revalidatePath: vi.fn(),
    revalidateTag: vi.fn(),
}));

// Mock Realtime
vi.mock("@tusker/core/lib/realtime", () => ({
    broadcastTeamUpdate: vi.fn(),
    TEAM_UPDATE: "TEAM_UPDATE",
    teamEvents: {
        on: vi.fn(),
        off: vi.fn(),
    },
}));

// Mock Cache Invalidation
vi.mock("@tusker/core/lib/cache/invalidation", () => ({
    invalidateWorkspace: vi.fn(),
    invalidateUserWorkspaces: vi.fn(),
    invalidateWorkspaceMembers: vi.fn(),
    invalidateAdminCheck: vi.fn(),
    invalidateWorkspaceAdminChecks: vi.fn(),
    invalidateWorkspaceProjects: vi.fn(),
    invalidateProjectTasks: vi.fn(),
    invalidateTaskMutation: vi.fn(),
    invalidateWorkspaceTags: vi.fn(),
    invalidateTaskComments: vi.fn(),
}));

// Core services resolve permissions through the pure resolver, not the
// session-aware web wrapper below.
vi.mock("@tusker/core/permissions", () => ({
    fetchWorkspacePermissions: vi.fn(),
    fetchUserPermissions: vi.fn(),
}));

// Mock Data Fetches
vi.mock("@/data/user/get-user-permissions", () => ({
    getWorkspacePermissions: vi.fn(),
    getUserPermissions: vi.fn(),
}));

vi.mock("@tusker/core/lib/constants/workspace-access", () => ({
    hasWorkspacePermission: vi.fn(),
}));

vi.mock("@tusker/core/lib/colors/project-colors", () => ({
    getUniqueRandomColor: vi.fn(() => "#000000"),
}));

// No longer mocking deleted get-workspace-by-id

vi.mock("@/lib/auth/require-user", () => ({
    getSession: vi.fn(),
    requireUser: vi.fn(),
}));

// Mock Data Invalidation Utilities
vi.mock("@/data/workspace/get-workspaces", () => ({
    invalidateWorkspacesCache: vi.fn(),
}));

vi.mock("@tusker/core/utils/get-invite-code", () => ({
    generateInviteCode: vi.fn(() => "mock-invite-code"),
}));

vi.mock("@tusker/core/lib/slug-generator", () => ({
    generateUniqueSlugs: vi.fn(async (names: string[]) => names.map((n: string) => n.toLowerCase().replace(/ /g, "-"))),
}));

vi.mock("@/lib/utils", () => ({
    parseIST: vi.fn((date) => new Date(date)),
    cn: vi.fn((...args) => args.filter(Boolean).join(" ")),
}));

vi.mock("@/data/tag/get-tags", () => ({
    tagNameExists: vi.fn(),
}));
