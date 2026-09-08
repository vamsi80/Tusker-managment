import { describe, expect, it } from "vitest";
import { formatLeaveRange, leaveNotificationBody } from "../notification-copy";

/** `@db.Date` values: midnight UTC, which is how leave_request stores them. */
const d = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
const leave = { startDate: d("2026-09-12"), endDate: d("2026-09-14"), type: "CASUAL", reason: "Sister's wedding" };

describe("formatLeaveRange", () => {
    it("collapses a single day", () => {
        expect(formatLeaveRange(d("2026-09-12"), d("2026-09-12"))).toBe("12 Sep");
    });

    it("shares the month across a range", () => {
        expect(formatLeaveRange(d("2026-09-12"), d("2026-09-14"))).toBe("12-14 Sep");
    });

    it("names both months when the range crosses one", () => {
        expect(formatLeaveRange(d("2026-09-28"), d("2026-10-02"))).toBe("28 Sep - 2 Oct");
    });

    /** The whole reason this goes through formatDateOnly rather than toLocaleDateString. */
    it("does not shift the day for a viewer east of UTC", () => {
        const tz = process.env.TZ;
        process.env.TZ = "Asia/Kolkata";
        expect(formatLeaveRange(d("2026-09-12"), d("2026-09-12"))).toBe("12 Sep");
        process.env.TZ = tz;
    });
});

describe("leaveNotificationBody", () => {
    it("tells the requester their own request is pending", () => {
        expect(leaveNotificationBody({
            action: "LEAVE_REQUESTED", actorName: "Priya", subjectName: "Priya", leave, viewerIsSubject: true,
        })).toBe("Your casual leave for 12-14 Sep is awaiting approval");
    });

    it("names the requester, the length and the reason for everyone else", () => {
        expect(leaveNotificationBody({
            action: "LEAVE_REQUESTED", actorName: "Priya", subjectName: "Priya", leave, viewerIsSubject: false,
        })).toBe(`Priya requested 3 days casual leave, 12-14 Sep - "Sister's wedding"`);
    });

    /** The bug this replaces: "Vamsi leave approved" never said whose leave it was. */
    it("names the subject, not just the approver, for admins", () => {
        expect(leaveNotificationBody({
            action: "LEAVE_APPROVED", actorName: "Vamsi", subjectName: "Priya", leave, viewerIsSubject: false,
        })).toBe("Vamsi approved Priya's casual leave, 12-14 Sep");
    });

    it("addresses the requester directly when approved", () => {
        expect(leaveNotificationBody({
            action: "LEAVE_APPROVED", actorName: "Vamsi", subjectName: "Priya", leave, viewerIsSubject: true,
        })).toBe("Your casual leave for 12-14 Sep was approved by Vamsi");
    });

    it("says declined, not rejected", () => {
        expect(leaveNotificationBody({
            action: "LEAVE_REJECTED", actorName: "Vamsi", subjectName: "Priya", leave, viewerIsSubject: false,
        })).toBe("Vamsi declined Priya's casual leave, 12-14 Sep");
    });

    it("avoids pronouns on withdrawal", () => {
        expect(leaveNotificationBody({
            action: "LEAVE_DELETED", actorName: "Priya", subjectName: "Priya", leave, viewerIsSubject: false,
        })).toBe("Priya withdrew their casual leave request for 12-14 Sep");
    });

    it("truncates a long reason", () => {
        const body = leaveNotificationBody({
            action: "LEAVE_REQUESTED", actorName: "Priya", subjectName: "Priya",
            leave: { ...leave, reason: "x".repeat(80) }, viewerIsSubject: false,
        });
        expect(body).toContain("...");
        expect(body.length).toBeLessThan(110);
    });

    it("degrades cleanly when dates or type are missing", () => {
        expect(leaveNotificationBody({
            action: "LEAVE_APPROVED", actorName: "Vamsi", subjectName: "Priya",
            leave: {}, viewerIsSubject: false,
        })).toBe("Vamsi approved Priya's leave");
    });
});
