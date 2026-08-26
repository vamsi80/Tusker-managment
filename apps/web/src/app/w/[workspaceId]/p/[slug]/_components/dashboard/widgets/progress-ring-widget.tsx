"use client";

import { cn } from "@/lib/utils";

interface TaskCount {
  status: string | null;
  _count: {
    _all: number;
  };
}

interface ProgressRingWidgetProps {
  taskCounts: TaskCount[];
}

export function ProgressRingWidget({ taskCounts }: ProgressRingWidgetProps) {
  let completed = 0;
  let total = 0;

  taskCounts.forEach((tc) => {
    if (tc.status === "COMPLETED") {
      completed = tc._count._all;
    }
    if (tc.status && tc.status !== "CANCELLED") {
      total += tc._count._all;
    }
  });

  const percentage = total > 0 ? Math.round((completed / total) * 100) : 0;

  // SVG parameters
  const radius = 50;
  const strokeWidth = 10;
  const normalizedRadius = radius - strokeWidth * 2;
  const circumference = normalizedRadius * 2 * Math.PI;
  const strokeDashoffset = circumference - (percentage / 100) * circumference;

  // Color selection based on progress
  let progressColor = "stroke-rose-500";
  let ringBgColor = "bg-rose-500/10";
  let textColor = "text-rose-600 dark:text-rose-400";
  
  if (percentage >= 70) {
    progressColor = "stroke-emerald-500";
    ringBgColor = "bg-emerald-500/10";
    textColor = "text-emerald-600 dark:text-emerald-400";
  } else if (percentage >= 40) {
    progressColor = "stroke-amber-500";
    ringBgColor = "bg-amber-500/10";
    textColor = "text-amber-600 dark:text-amber-400";
  }

  return (
    <div className="flex flex-col items-center justify-center p-6 rounded-2xl border bg-card text-card-foreground shadow-sm h-full min-h-[220px]">
      <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-4">
        Project Progress
      </h3>
      <div className="relative flex items-center justify-center">
        <svg
          height={radius * 2}
          width={radius * 2}
          className="transform -rotate-90"
        >
          {/* Background circle */}
          <circle
            className="stroke-muted"
            fill="transparent"
            strokeWidth={strokeWidth}
            r={normalizedRadius}
            cx={radius}
            cy={radius}
          />
          {/* Progress circle */}
          <circle
            className={cn("transition-all duration-500 ease-out", progressColor)}
            fill="transparent"
            strokeWidth={strokeWidth}
            strokeDasharray={circumference + " " + circumference}
            style={{ strokeDashoffset }}
            strokeLinecap="round"
            r={normalizedRadius}
            cx={radius}
            cy={radius}
          />
        </svg>
        <div className="absolute flex flex-col items-center justify-center">
          <span className={cn("text-2xl font-bold tracking-tight", textColor)}>
            {percentage}%
          </span>
        </div>
      </div>
      <div className="mt-4 text-xs text-muted-foreground text-center">
        {completed} of {total} tasks completed
      </div>
    </div>
  );
}
