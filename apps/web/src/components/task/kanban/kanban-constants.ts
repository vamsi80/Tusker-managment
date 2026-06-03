import { STATUS_COLORS, STATUS_LABELS } from "@/lib/colors/status-colors";

export type TaskStatus =
  | "TO_DO"
  | "IN_PROGRESS"
  | "CANCELLED"
  | "REVIEW"
  | "HOLD"
  | "COMPLETED";

export const COLUMNS: {
  id: TaskStatus;
  title: string;
  color: string;
  bgColor: string;
  borderColor: string;
}[] = [
    {
      id: "TO_DO",
      title: STATUS_LABELS.TO_DO,
      ...STATUS_COLORS.TO_DO,
    },
    {
      id: "IN_PROGRESS",
      title: STATUS_LABELS.IN_PROGRESS,
      ...STATUS_COLORS.IN_PROGRESS,
    },
    {
      id: "REVIEW",
      title: STATUS_LABELS.REVIEW,
      ...STATUS_COLORS.REVIEW,
    },
    {
      id: "COMPLETED",
      title: STATUS_LABELS.COMPLETED,
      ...STATUS_COLORS.COMPLETED,
    },
    {
      id: "HOLD",
      title: STATUS_LABELS.HOLD,
      ...STATUS_COLORS.HOLD,
    },
    {
      id: "CANCELLED",
      title: STATUS_LABELS.CANCELLED,
      ...STATUS_COLORS.CANCELLED,
    },
  ];
