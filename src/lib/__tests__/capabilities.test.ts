import { describe, it, expect } from "vitest";
import {
    resolveCapabilities,
    DEFAULT_CAPABILITIES,
    CAPABILITIES,
    can,
} from "@/lib/constants/capabilities";

describe("capability resolution", () => {
    it("falls back to role defaults when nothing is overridden", () => {
        expect(resolveCapabilities("MEMBER")).toEqual(DEFAULT_CAPABILITIES.MEMBER);
        expect(resolveCapabilities("MANAGER")["project:create"]).toBe(true);
        expect(resolveCapabilities("MEMBER")["project:create"]).toBe(false);
    });

    it("applies the workspace role override over the default", () => {
        const caps = resolveCapabilities("MEMBER", { MEMBER: { "task:edit": false } });
        expect(caps["task:edit"]).toBe(false);
        // untouched rows keep their default
        expect(caps["task:create"]).toBe(true);
    });

    it("lets a member exception win over the role override", () => {
        const caps = resolveCapabilities(
            "MEMBER",
            { MEMBER: { "task:edit": false } },
            { "task:edit": true }
        );
        expect(caps["task:edit"]).toBe(true);
    });

    it("only applies the override block matching the member's own role", () => {
        const caps = resolveCapabilities("MANAGER", { MEMBER: { "task:edit": false } });
        expect(caps["task:edit"]).toBe(true);
    });

    it("never lets an override lock the OWNER out", () => {
        const caps = resolveCapabilities(
            "OWNER",
            { OWNER: { "project:create": false } },
            { "procurement:view": false }
        );
        expect(CAPABILITIES.every((c) => caps[c.id])).toBe(true);
    });

    it("denies everything when the user has no workspace role", () => {
        const caps = resolveCapabilities(null);
        expect(CAPABILITIES.every((c) => caps[c.id] === false)).toBe(true);
    });

    it("ignores malformed JSON instead of throwing", () => {
        expect(resolveCapabilities("MEMBER", "garbage", 42)).toEqual(DEFAULT_CAPABILITIES.MEMBER);
        expect(resolveCapabilities("MEMBER", { MEMBER: { "task:edit": "yes" } })["task:edit"]).toBe(true);
        expect(resolveCapabilities("MEMBER", { NOT_A_ROLE: { "task:edit": false } })["task:edit"]).toBe(true);
    });

    it("can() is false for a missing map rather than throwing", () => {
        expect(can(undefined, "task:edit")).toBe(false);
        expect(can(resolveCapabilities("MEMBER"), "task:edit")).toBe(true);
    });
});
