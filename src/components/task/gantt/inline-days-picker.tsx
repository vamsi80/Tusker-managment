"use client";

import * as React from "react";
import { format } from "date-fns";
import { cn, APP_DATE_FORMAT } from "@/lib/utils";
import { parseGanttDate, parseDate } from "./utils";

interface InlineDaysPickerProps {
  days: number | null | undefined;
  start: string | null | undefined;
  disabled?: boolean;
  onSave: (days: number, newEndStr: string) => void;
}

const parseAnyDate = (s: string | null | undefined): Date | undefined => {
  if (!s) return undefined;
  const d1 = parseGanttDate(s);
  if (d1) return d1;
  const d2 = parseDate(s);
  return d2 || undefined;
};

export function InlineDaysPicker({
  days,
  start,
  disabled,
  onSave,
}: InlineDaysPickerProps) {
  const [editing, setEditing] = React.useState(false);
  const [value, setValue] = React.useState(days?.toString() || "");
  const inputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    setValue(days?.toString() || "");
  }, [days]);

  React.useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  const handleSave = () => {
    setEditing(false);
    const parsed = parseInt(value, 10);
    if (isNaN(parsed) || parsed < 1) {
      setValue(days?.toString() || "");
      return;
    }

    if (parsed === days) return;

    const startDate = parseAnyDate(start);
    if (!startDate) return;

    const newEnd = new Date(startDate);
    newEnd.setDate(newEnd.getDate() + parsed - 1);
    const newEndStr = format(newEnd, APP_DATE_FORMAT);

    onSave(parsed, newEndStr);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      handleSave();
    } else if (e.key === "Escape") {
      setEditing(false);
      setValue(days?.toString() || "");
    }
  };

  if (disabled || !start) {
    return (
      <span className="text-[10px] text-muted-foreground font-medium">
        {days || "-"}
      </span>
    );
  }

  if (editing) {
    return (
      <input
        ref={inputRef}
        type="number"
        min="1"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={handleSave}
        onKeyDown={handleKeyDown}
        className="w-12 h-5 text-[10px] text-center font-medium border border-ring rounded focus:outline-none focus:ring-1 focus:ring-ring bg-background text-foreground"
      />
    );
  }

  return (
    <button
      onClick={() => setEditing(true)}
      className={cn(
        "text-[10px] text-muted-foreground font-medium hover:text-foreground hover:underline focus:outline-none focus:ring-1 focus:ring-ring rounded px-1 -mx-1"
      )}
    >
      {days || "-"}
    </button>
  );
}
