import { Badge } from "@/components/ui/badge";
import { Check, AlertCircle } from "lucide-react";

export function SuppliedBeforeBadge({ hasSupplied }: { hasSupplied: boolean }) {
  if (hasSupplied) {
    return (
      <Badge className="gap-1 bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100">
        <Check className="h-3 w-3" /> Yes
      </Badge>
    );
  }
  
  return (
    <Badge variant="outline" className="gap-1 text-gray-500 bg-gray-50 border-gray-200">
      <AlertCircle className="h-3 w-3" /> No
    </Badge>
  );
}
