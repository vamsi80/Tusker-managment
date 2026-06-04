import { describe, test, expect, beforeAll, beforeEach, vi } from "vitest";

// Ensure this test runs against the real DB since it tests pg_trgm logic
vi.unmock("@/lib/db");

import { PrismaClient } from "@/generated/prisma";
import { getDb } from "@/lib/registry";
import { VendorService } from "../vendor/vendor.service";
import { VendorRepository } from "../vendor/vendor.repository";

const prisma = new PrismaClient();


describe("Vendor Onboarding & Comparison Tests", () => {
  const mockWorkspaceId = "test-workspace-uuid-123";
  let activeVendorId: string;
  let blacklistedVendorId: string;

  beforeAll(async () => {
    // Ensure test user exists
    await getDb().user.upsert({
      where: { id: "mock-user-id" },
      update: {},
      create: {
        id: "mock-user-id",
        email: "mock-user@example.com",
        name: "Mock User",
      }
    });

    // Ensure test workspace exists
    const w = await getDb().workspace.upsert({
      where: { id: mockWorkspaceId },
      update: {},
      create: {
        id: mockWorkspaceId,
        name: "Test Workspace",
        slug: "test-workspace",
        ownerId: "mock-user-id",
        inviteCode: "test-code",
      }
    });

    // Clear test capabilities & vendors
    await getDb().vendorMaterialCapability.deleteMany({ where: { workspaceId: mockWorkspaceId } });
    await getDb().vendor.deleteMany({ where: { workspaceId: mockWorkspaceId } });
  });

  beforeEach(async () => {
    // Re-create pristine vendors before tests
    await getDb().vendorMaterialCapability.deleteMany({ where: { workspaceId: mockWorkspaceId } });
    await getDb().vendor.deleteMany({ where: { workspaceId: mockWorkspaceId } });

    const active = await VendorService.createVendor({
      workspaceId: mockWorkspaceId,
      name: "TATA Steel Distribution",
      companyName: "TATA Steel Ltd",
      gstNumber: "27AAAAA0000A1Z5", // valid mockup GST format
    });
    activeVendorId = active.id;

    const blacklisted = await VendorService.createVendor({
      workspaceId: mockWorkspaceId,
      name: "Bad Steel Corp",
      companyName: "Bad Steel Corp",
    });
    await VendorService.blacklistVendor(blacklisted.id, mockWorkspaceId);
    blacklistedVendorId = blacklisted.id;
  });

  test("suggestVendors returns empty when no capability matches", async () => {
    const suggestions = await VendorRepository.findSuggestedVendors(mockWorkspaceId, "Cement Grade 53");
    expect(suggestions).toHaveLength(0);
  });

  test("suggestVendors correctly returns matched vendor but excludes BLACKLISTED ones", async () => {
    // Add matching capability to both active & blacklisted vendor
    await VendorService.addManualCapability(activeVendorId, mockWorkspaceId, "tmt steel rods", "ton");
    await VendorService.addManualCapability(blacklistedVendorId, mockWorkspaceId, "tmt steel rods", "ton");

    const suggestions = await VendorRepository.findSuggestedVendors(mockWorkspaceId, "tmt steel");

    expect(suggestions).toHaveLength(1);
    expect(suggestions[0].vendorId).toBe(activeVendorId);
  });

  test("trigram similarity threshold correctly filters weak matches (score <= 0.4)", async () => {
    await VendorService.addManualCapability(activeVendorId, mockWorkspaceId, "cement powder", "bags");

    // "cement powder" vs "copper wire" has very low trigram similarity
    const suggestions = await VendorRepository.findSuggestedVendors(mockWorkspaceId, "copper wire");
    expect(suggestions).toHaveLength(0);
  });

  test("duplicate capability inserts are idempotent and do not throw error", async () => {
    await VendorService.addManualCapability(activeVendorId, mockWorkspaceId, "tmt steel rods");

    // Inserting duplicate should succeed with upsert logic
    await expect(
      VendorService.addManualCapability(activeVendorId, mockWorkspaceId, "  TMT STEEL RODS  ")
    ).resolves.not.toThrow();

    const count = await getDb().vendorMaterialCapability.count({
      where: { vendorId: activeVendorId, materialName: "tmt steel rods" }
    });
    expect(count).toBe(1);
  });

  test("can add manual capability with custom serviceType", async () => {
    const cap = await VendorService.addManualCapability(
      activeVendorId,
      mockWorkspaceId,
      "plumbing works",
      "sqm",
      "LABOUR"
    );

    expect(cap.serviceType).toBe("LABOUR");

    const fetched = await getDb().vendorMaterialCapability.findUnique({
      where: { id: cap.id }
    });
    expect(fetched?.serviceType).toBe("LABOUR");
  });
});
