import type { User, Session } from "better-auth";
import type { createAuth } from "./server";

/** The single canonical Better Auth instance type (server-side). */
export type Auth = ReturnType<typeof createAuth>;

/**
 * Better Auth's `User` only covers standard fields. `TuskerUser` adds the custom
 * Prisma columns that are always present at runtime (see prisma `user` model).
 */
export type TuskerUser = User & {
    surname: string;
};

export type { User, Session };
