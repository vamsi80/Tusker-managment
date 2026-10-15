import { AlertTriangle } from "lucide-react";
import type { MeetingUI } from "@tusker/api-client/meetings";
import { cn } from "@/lib/utils";

export const overlapText = (m: Pick<MeetingUI, "overlapsWith">) =>
  `Overlaps with ${(m.overlapsWith ?? []).map((o) => o.title).join(", ")}`;

/** Amber warning shown on a meeting that clashes with another of the viewer's meetings. */
export function OverlapIcon({ meeting, className }: { meeting: MeetingUI; className?: string }) {
  if (!meeting.overlapsWith?.length) return null;
  const text = overlapText(meeting);
  return (
    <AlertTriangle
      role="img"
      aria-label={text}
      className={cn("size-3 shrink-0 text-amber-500", className)}
    >
      <title>{text}</title>
    </AlertTriangle>
  );
}
