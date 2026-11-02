import { Badge } from "@/components/ui/badge";
import { BOQ_STATUS_LABELS, type BoqStatus } from "@tusker/core/lib/procurement/boq";

const CLASS: Record<BoqStatus, string> = {
  DRAFT: "bg-muted text-muted-foreground border-border",
  SUBMITTED: "bg-blue-500/10 text-blue-500 border-blue-500/20",
  APPROVED: "bg-emerald-500/10 text-emerald-500 border-emerald-500/20",
  REJECTED: "bg-destructive/10 text-destructive border-destructive/20",
  SUPERSEDED: "bg-muted text-muted-foreground border-border line-through",
};

export function BoqStatusBadge({ status }: { status: BoqStatus }) {
  return (
    <Badge variant="outline" className={CLASS[status] ?? CLASS.DRAFT}>
      {BOQ_STATUS_LABELS[status] ?? status}
    </Badge>
  );
}
