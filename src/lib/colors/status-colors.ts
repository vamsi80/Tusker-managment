import { STATUS_LABELS } from "@/lib/zodSchemas";

type TaskStatus = "TO_DO" | "IN_PROGRESS" | "REVIEW" | "HOLD" | "COMPLETED" | "CANCELLED";

export interface StatusColors {
    color: string;
    bgColor: string;
    borderColor: string;
}

export const STATUS_COLORS: Record<TaskStatus, StatusColors> = {
    TO_DO: {
        color: "text-slate-600",
        bgColor: "bg-[#D1D5DB]/20",
        borderColor: "border-[#D1D5DB]/50",
    },
    IN_PROGRESS: {
        color: "text-[#3B82F6]",
        bgColor: "bg-[#3B82F6]/10",
        borderColor: "border-[#3B82F6]/20",
    },
    REVIEW: {
        color: "text-[#8B5CF6]",
        bgColor: "bg-[#8B5CF6]/10",
        borderColor: "border-[#8B5CF6]/20",
    },
    HOLD: {
        color: "text-[#F59E0B]",
        bgColor: "bg-[#F59E0B]/10",
        borderColor: "border-[#F59E0B]/20",
    },
    COMPLETED: {
        color: "text-[#22C55E]",
        bgColor: "bg-[#22C55E]/10",
        borderColor: "border-[#22C55E]/20",
    },
    CANCELLED: {
        color: "text-[#EF4444]",
        bgColor: "bg-[#EF4444]/10",
        borderColor: "border-[#EF4444]/20",
    },
};

// Re-export STATUS_LABELS for backward compatibility
export { STATUS_LABELS };

export function getStatusColors(status: string | null | undefined): StatusColors {
    if (!status) {
        return {
            color: "text-muted-foreground",
            bgColor: "bg-muted",
            borderColor: "border-muted",
        };
    }

    return STATUS_COLORS[status as TaskStatus] || {
        color: "text-muted-foreground",
        bgColor: "bg-muted",
        borderColor: "border-muted",
    };
}

export function getStatusLabel(status: string | null | undefined): string {
    if (!status) return "-";
    return STATUS_LABELS[status as TaskStatus] || status;
}
