import { vi } from "vitest";

vi.mock("server-only", () => ({}));

// Define shared mock functions
const sharedMocks = {
    user: {
        upsert: vi.fn(),
        delete: vi.fn(),
        count: vi.fn(),
    },
    workspaceMember: {
        upsert: vi.fn(),
        deleteMany: vi.fn(),
    },
    workspace: {
        count: vi.fn(),
        findUnique: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
        findMany: vi.fn(),
    },
    project: {
        create: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
        findUnique: vi.fn(),
        findFirst: vi.fn(),
        findMany: vi.fn(),
    },
    projectMember: {
        create: vi.fn(),
        update: vi.fn(),
        findFirst: vi.fn(),
        findMany: vi.fn(),
    },
    task: {
        create: vi.fn(() => ({ id: "mock-task-id" })),
        update: vi.fn(),
        delete: vi.fn(),
        findUnique: vi.fn(),
        findFirst: vi.fn(),
        findMany: vi.fn(),
    },
    tag: {
        create: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
        findMany: vi.fn(),
    },
    procurementTask: {
        create: vi.fn(() => ({ id: "mock-pt-id" })),
    },
    board: {
        create: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
        findUnique: vi.fn(),
        findMany: vi.fn(),
    },
    dailyReport: {
        create: vi.fn(),
        update: vi.fn(),
        findUnique: vi.fn(),
    },
    dailyReportEntry: {
        createMany: vi.fn(),
    },
    comment: {
        create: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
        findUnique: vi.fn(),
    },
};

// Mock Prisma
vi.mock("@/lib/db", () => ({
    default: {
        ...sharedMocks,
        $transaction: vi.fn(async (cb) => {
            if (typeof cb === 'function') {
                return await cb(sharedMocks);
            }
            // Handle array of promises
            return Array.isArray(cb) ? await Promise.all(cb) : cb;
        }),
    },
}));

// Mock Better Auth
vi.mock("@/lib/auth", () => ({
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
vi.mock("@/lib/realtime", () => ({
    broadcastTeamUpdate: vi.fn(),
    TEAM_UPDATE: "TEAM_UPDATE",
    teamEvents: {
        on: vi.fn(),
        off: vi.fn(),
    },
}));

// Mock Cache Invalidation
vi.mock("@/lib/cache/invalidation", () => ({
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

// Mock Data Fetches
vi.mock("@/data/user/get-user-permissions", () => ({
    getWorkspacePermissions: vi.fn(),
    getUserPermissions: vi.fn(),
}));

vi.mock("@/lib/constants/workspace-access", () => ({
    hasWorkspacePermission: vi.fn(),
}));

vi.mock("@/lib/colors/project-colors", () => ({
    getUniqueRandomColor: vi.fn(() => "#000000"),
}));

vi.mock("@/data/workspace/get-workspace-by-id", () => ({
    getWorkspaceById: vi.fn(),
}));

vi.mock("@/lib/auth/require-user", () => ({
    requireUser: vi.fn(),
}));

// Mock Data Invalidation Utilities
vi.mock("@/data/workspace/get-workspaces", () => ({
    invalidateWorkspacesCache: vi.fn(),
}));

vi.mock("@/utils/get-invite-code", () => ({
    generateInviteCode: vi.fn(() => "mock-invite-code"),
}));

vi.mock("@/lib/slug-generator", () => ({
    generateUniqueSlugs: vi.fn(async (names: string[]) => names.map((n: string) => n.toLowerCase().replace(/ /g, "-"))),
}));

vi.mock("@/lib/utils", () => ({
    parseIST: vi.fn((date) => new Date(date)),
    cn: vi.fn((...args) => args.filter(Boolean).join(" ")),
}));

vi.mock("@/data/tag/get-tags", () => ({
    tagNameExists: vi.fn(),
}));
