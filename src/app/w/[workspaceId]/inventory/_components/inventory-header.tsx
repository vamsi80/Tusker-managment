"use client";

import { usePathname } from "next/navigation";

export function InventoryHeader() {
    const pathname = usePathname();
    const isVendorPage = pathname.includes("/vendors");

    return (
        <div>
            <h1 className="text-2xl font-bold tracking-tight">
                {isVendorPage ? "Vendors" : "Inventory"}
            </h1>
            <p className="text-muted-foreground text-sm">
                {isVendorPage
                    ? "Manage your vendors and suppliers"
                    : "Inventory flagged for purchase requirements"}
            </p>
        </div>
    );
}
