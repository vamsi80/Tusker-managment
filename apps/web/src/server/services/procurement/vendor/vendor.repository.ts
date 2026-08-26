import "server-only";
import prisma from "@/lib/db";

export class VendorRepository {
  /**
   * Raw trigram similarity search matching materialName against capabilities within a workspace.
   * Excludes inactive or blacklisted vendors.
   */
  static async findSuggestedVendors(workspaceId: string, materialName: string) {
    const normalized = materialName.toLowerCase().trim();
    
    return prisma.$queryRaw<
      { vendorId: string; similarity: number; materialName: string }[]
    >`
      SELECT vmc."vendorId", vmc."materialName",
             similarity(vmc."materialName", ${normalized}) AS similarity
      FROM   vendor_material_capability vmc
      JOIN   vendor v ON v.id = vmc."vendorId"
      WHERE  vmc."workspaceId" = ${workspaceId}
        AND  v."isActive" = true
        AND  v."status" != 'BLACKLISTED'
        AND  similarity(vmc."materialName", ${normalized}) > 0.4
      ORDER BY similarity DESC
      LIMIT 10
    `;
  }

  /**
   * Enriches suggested vendor raw payloads with full vendor structures and metrics.
   */
  static async enrichSuggestions(
    suggestions: { vendorId: string; similarity: number; materialName: string }[]
  ) {
    if (suggestions.length === 0) return [];
    
    const vendorIds = suggestions.map((s) => s.vendorId);
    const vendors = await prisma.vendor.findMany({
      where: { id: { in: vendorIds } },
      include: {
        quotes: {
          select: { status: true },
        },
      },
    });

    return suggestions.map((s) => {
      const vendor = vendors.find((v) => v.id === s.vendorId)!;
      // Derive a simple historical score based on approved quotes ratio
      const totalQuotes = vendor.quotes.length;
      const approvedQuotes = vendor.quotes.filter((q) => q.status === "APPROVED").length;
      const performanceScore = totalQuotes > 0 ? Math.round((approvedQuotes / totalQuotes) * 100) : 100;

      return {
        vendor: {
          id: vendor.id,
          name: vendor.name,
          companyName: vendor.companyName,
          email: vendor.email,
          phoneNumber: vendor.phoneNumber,
        },
        similarityScore: s.similarity,
        capabilityMatchedOn: s.materialName,
        performanceScore,
      };
    });
  }

  static async hasSuppliedBefore(vendorId: string, materialName: string): Promise<boolean> {
    const normalized = materialName.toLowerCase().trim();
    const count = await prisma.vendorMaterialCapability.count({
      where: {
        vendorId,
        materialName: normalized,
      },
    });
    return count > 0;
  }
}
