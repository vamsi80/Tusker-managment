"use client";

import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Browser print dialog - "Save as PDF" there produces the PO file. */
export function PrintButton() {
  return (
    <Button variant="outline" size="sm" onClick={() => window.print()}>
      <Printer className="size-3.5" /> Print / Save as PDF
    </Button>
  );
}
