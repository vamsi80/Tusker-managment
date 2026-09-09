import { describe, expect, it } from "vitest";
import { resolveCapabilities } from "../constants/capabilities";
import {
    PROJECT_PERMISSIONS,
    PROJECT_ROLES,
    DEFAULT_PROJECT_PERMISSIONS,
    DEFAULT_PROJECT_SETTINGS,
    resolveProjectPermissions,
    coerceProjectOverrides,
    coerceProjectSettings,
    canSetStatus,
    isMandatoryTransition,
    missingTransitionEvidence,
} from "../constants/project-permissions";

describe("resolveProjectPermissions", () => {
    it("an unconfigured project resolves to the role defaults for every project role", () => {
        for (const role of PROJECT_ROLES) {
            expect(resolveProjectPermissions(role, null)).toEqual(DEFAULT_PROJECT_PERMISSIONS[role]);
            expect(resolveProjectPermissions(role, undefined)).toEqual(DEFAULT_PROJECT_PERMISSIONS[role]);
        }
    });

    it("reproduces today's behaviour: execution roles can act, MEMBER only moves status, VIEWER nothing", () => {
        expect(resolveProjectPermissions("PROJECT_MANAGER")["bulk:upload"]).toBe(true);
        expect(resolveProjectPermissions("PROJECT_COORDINATOR")["task:create"]).toBe(true);
        expect(resolveProjectPermissions("LEAD")["task:edit"]).toBe(true);

        const member = resolveProjectPermissions("MEMBER");
        expect(member["task:status"]).toBe(true);
        expect(member["task:create"]).toBe(false);
        expect(member["bulk:upload"]).toBe(false);
        expect(member["task:assign"]).toBe(false);

        for (const { id } of PROJECT_PERMISSIONS) {
            expect(resolveProjectPermissions("VIEWER")[id]).toBe(false);
        }
    });

    it("no project role at all resolves to nothing", () => {
        for (const { id } of PROJECT_PERMISSIONS) {
            expect(resolveProjectPermissions(null)[id]).toBe(false);
        }
    });

    it("a member override both grants and revokes", () => {
        expect(resolveProjectPermissions("MEMBER", { "bulk:upload": true })["bulk:upload"]).toBe(true);
        expect(resolveProjectPermissions("PROJECT_MANAGER", { "task:edit": false })["task:edit"]).toBe(false);
    });

    it("cannot exceed a revoked workspace capability", () => {
        const caps = resolveCapabilities("MEMBER", undefined, { "task:edit": false });
        const resolved = resolveProjectPermissions("PROJECT_MANAGER", { "task:edit": true }, caps);
        expect(resolved["task:edit"]).toBe(false);
        // task:assign hangs off the same workspace capability.
        expect(resolved["task:assign"]).toBe(false);
        // ...but an unrelated column is untouched.
        expect(resolved["indent:raise"]).toBe(true);
    });

    it("a workspace admin is never locked out of their own project", () => {
        const caps = resolveCapabilities("ADMIN");
        const resolved = resolveProjectPermissions("VIEWER", { "task:create": false }, caps, true);
        for (const { id } of PROJECT_PERMISSIONS) expect(resolved[id]).toBe(true);
    });

    it("malformed override JSON degrades to {} instead of throwing", () => {
        for (const junk of [null, undefined, 42, "nope", [], { "task:edit": "yes" }, { bogus: true }]) {
            expect(coerceProjectOverrides(junk)).toEqual({});
            expect(resolveProjectPermissions("MEMBER", junk)).toEqual(DEFAULT_PROJECT_PERMISSIONS.MEMBER);
        }
    });
});

describe("coerceProjectSettings", () => {
    it("falls back to the defaults for anything that is not a boolean", () => {
        expect(coerceProjectSettings(null)).toEqual(DEFAULT_PROJECT_SETTINGS);
        expect(coerceProjectSettings([])).toEqual(DEFAULT_PROJECT_SETTINGS);
        expect(coerceProjectSettings({ mandatoryComment: "yes" })).toEqual(DEFAULT_PROJECT_SETTINGS);
        expect(coerceProjectSettings({ mandatoryComment: true })).toEqual({
            mandatoryComment: true,
            mandatoryAttachment: false,
        });
    });
});

describe("canSetStatus", () => {
    const pm = resolveProjectPermissions("PROJECT_MANAGER");
    const member = resolveProjectPermissions("MEMBER");

    it("the three approval statuses each read their own column", () => {
        expect(canSetStatus(pm, "COMPLETED", false)).toBe(true);
        expect(canSetStatus(resolveProjectPermissions("PROJECT_MANAGER", { "status:hold": false }), "HOLD", false))
            .toBe(false);
    });

    it("the assignee is never the approver, whatever the matrix says", () => {
        for (const status of ["COMPLETED", "HOLD", "CANCELLED"]) {
            expect(canSetStatus(pm, status, true)).toBe(false);
        }
        // ...but they can still move it along the working statuses.
        expect(canSetStatus(pm, "IN_PROGRESS", true)).toBe(true);
    });

    it("the open statuses only need task:status", () => {
        expect(canSetStatus(member, "IN_PROGRESS", false)).toBe(true);
        expect(canSetStatus(member, "COMPLETED", false)).toBe(false);
        expect(canSetStatus(resolveProjectPermissions("VIEWER"), "TO_DO", false)).toBe(false);
    });
});

describe("isMandatoryTransition", () => {
    it("matches the rule the three former copies all implemented", () => {
        expect(isMandatoryTransition("TO_DO", "REVIEW")).toBe(true);
        expect(isMandatoryTransition("TO_DO", "HOLD")).toBe(true);
        expect(isMandatoryTransition("HOLD", "IN_PROGRESS")).toBe(true);
        expect(isMandatoryTransition("REVIEW", "TO_DO")).toBe(true);
        expect(isMandatoryTransition("IN_PROGRESS", "TO_DO")).toBe(true);
        expect(isMandatoryTransition("REVIEW", "COMPLETED")).toBe(false);
        expect(isMandatoryTransition("TO_DO", "IN_PROGRESS")).toBe(false);
        expect(isMandatoryTransition(null, "IN_PROGRESS")).toBe(false);
    });
});

describe("missingTransitionEvidence", () => {
    it("with both flags off, a comment or an attachment satisfies it — today's rule", () => {
        const off = DEFAULT_PROJECT_SETTINGS;
        expect(missingTransitionEvidence(off, { comment: true, attachment: false })).toBeNull();
        expect(missingTransitionEvidence(off, { comment: false, attachment: true })).toBeNull();
        expect(missingTransitionEvidence(off, { comment: false, attachment: false })).toContain("comment or attachment");
    });

    it("each flag makes that one required on its own", () => {
        expect(
            missingTransitionEvidence(
                { mandatoryComment: true, mandatoryAttachment: false },
                { comment: false, attachment: true },
            ),
        ).toContain("comment is required");

        expect(
            missingTransitionEvidence(
                { mandatoryComment: false, mandatoryAttachment: true },
                { comment: true, attachment: false },
            ),
        ).toContain("attachment is required");

        expect(
            missingTransitionEvidence(
                { mandatoryComment: true, mandatoryAttachment: true },
                { comment: true, attachment: true },
            ),
        ).toBeNull();
    });
});
