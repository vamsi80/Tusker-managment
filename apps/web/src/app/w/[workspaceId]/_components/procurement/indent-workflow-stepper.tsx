"use client";

import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

interface IndentWorkflowStepperProps {
  status: string;
}

export function IndentWorkflowStepper({ status }: IndentWorkflowStepperProps) {
  const steps = [
    { label: "Draft", value: "DRAFT" },
    { label: "Submitted", value: "SUBMITTED" },
    { label: "Assigned", value: "ASSIGNED" },
    { label: "Approved", value: "APPROVED" },
  ];

  if (status === "CANCELLED") {
    return (
      <div className="flex items-center justify-center p-3 border border-destructive/20 bg-destructive/5 rounded-md text-xs font-semibold text-destructive uppercase tracking-widest gap-2">
        <span>Indent is Cancelled</span>
      </div>
    );
  }

  // Calculate current active index
  const getActiveIndex = (currentStatus: string) => {
    switch (currentStatus) {
      case "DRAFT":
        return 0;
      case "SUBMITTED":
        return 1;
      case "ASSIGNED":
        return 2;
      case "APPROVED":
        return 3;
      default:
        return 0;
    }
  };

  const activeIndex = getActiveIndex(status);

  return (
    <div className="py-2.5 px-1">
      <div className="relative flex items-center justify-between w-full">
        {/* Line Connector */}
        <div className="absolute left-0 right-0 top-1/2 -translate-y-1/2 h-0.5 bg-muted -z-10" />
        
        {/* Active Progress Connector */}
        <div
          className="absolute left-0 top-1/2 -translate-y-1/2 h-0.5 bg-primary transition-all duration-500 -z-10"
          style={{
            width: `${(activeIndex / (steps.length - 1)) * 100}%`,
          }}
        />

        {steps.map((step, index) => {
          const isCompleted = index < activeIndex;
          const isActive = index === activeIndex;
          const isPending = index > activeIndex;

          return (
            <div key={step.value} className="flex flex-col items-center">
              <div
                className={cn(
                  "size-6 rounded-full flex items-center justify-center border-2 text-[10px] font-bold transition-all duration-300 shadow-sm",
                  isCompleted && "bg-primary border-primary text-primary-foreground",
                  isActive && "bg-background border-primary text-primary ring-2 ring-primary/20 scale-110",
                  isPending && "bg-background border-muted text-muted-foreground"
                )}
              >
                {isCompleted ? (
                  <Check className="size-3 stroke-[3]" />
                ) : (
                  <span>{index + 1}</span>
                )}
              </div>
              <span
                className={cn(
                  "text-[9px] font-bold uppercase tracking-wider mt-1.5 transition-colors whitespace-nowrap hidden sm:inline",
                  isActive ? "text-primary font-black" : "text-muted-foreground/60"
                )}
              >
                {step.label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
