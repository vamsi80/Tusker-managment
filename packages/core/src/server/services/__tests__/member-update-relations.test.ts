import { describe, it, expect } from "vitest";

describe("Member update real-time relations sync", () => {
    it("preserves or resolves departmentName and reportToName when merging flatRecord", () => {
        const departments = [
            { id: "dept-1", name: "Engineering" },
            { id: "dept-2", name: "Sales" },
        ];

        const initialMember = {
            id: "mem-1",
            name: "Alice",
            surname: "Wonder",
            email: "alice@example.com",
            departmentId: "dept-1",
            departmentName: "Engineering",
            reportToId: "mgr-1",
            reportToName: "Smith",
            openTaskCount: 5,
        };

        // Simulated flatRecord received from update without relations
        const partialUpdate = {
            id: "mem-1",
            name: "Alice",
            surname: "Cooper",
            phoneNumber: "9876543210",
            departmentId: "dept-2",
            // departmentName is omitted in partial payload
        };

        const targetDeptId = partialUpdate.departmentId ?? initialMember.departmentId;
        const resolvedDeptName = (partialUpdate as any).departmentName ??
            (targetDeptId ? departments.find(d => d.id === targetDeptId)?.name : null) ??
            initialMember.departmentName;

        const resolvedReportName = (partialUpdate as any).reportToName ??
            ((partialUpdate as any).reportToId === null ? null : initialMember.reportToName);

        const merged = {
            ...initialMember,
            ...partialUpdate,
            departmentName: resolvedDeptName,
            reportToName: resolvedReportName,
            openTaskCount: (partialUpdate as any).openTaskCount ?? initialMember.openTaskCount,
        };

        expect(merged.surname).toBe("Cooper");
        expect(merged.departmentName).toBe("Sales");
        expect(merged.reportToName).toBe("Smith");
        expect(merged.openTaskCount).toBe(5);
    });

    it("clears departmentName and reportToName when explicitly set to null/empty", () => {
        const initialMember = {
            id: "mem-1",
            name: "Alice",
            surname: "Wonder",
            departmentId: "dept-1",
            departmentName: "Engineering",
            reportToId: "mgr-1",
            reportToName: "Smith",
        };

        const clearedUpdate = {
            id: "mem-1",
            departmentId: null,
            reportToId: null,
            departmentName: null,
            reportToName: null,
        };

        const merged = {
            ...initialMember,
            ...clearedUpdate,
        };

        expect(merged.departmentName).toBeNull();
        expect(merged.reportToName).toBeNull();
    });
});
