"use client";

import * as React from "react";
import { format } from "date-fns";
import { cn, APP_DATE_FORMAT } from "@/lib/utils";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { parseGanttDate, parseDate } from "./utils";
import { DateRange } from "react-day-picker";

interface InlineDateRangePickerProps {
  start: string | null | undefined;
  end: string | null | undefined;
  disabled?: boolean;
  onSave: (startStr: string, endStr: string, days: number) => void;
}

const parseAnyDate = (s: string | null | undefined): Date | undefined => {
  if (!s) return undefined;
  const d1 = parseGanttDate(s);
  if (d1) return d1;
  const d2 = parseDate(s);
  return d2 || undefined;
};

export function InlineDateRangePicker({
  start,
  end,
  disabled,
  onSave,
}: InlineDateRangePickerProps) {
  const [open, setOpen] = React.useState(false);

  const initialRange = React.useMemo<DateRange>(() => {
    return {
      from: parseAnyDate(start),
      to: parseAnyDate(end),
    };
  }, [start, end]);

  const [selectedRange, setSelectedRange] = React.useState<DateRange | undefined>(initialRange);

  React.useEffect(() => {
    if (open) {
      setSelectedRange(initialRange);
    }
  }, [open, initialRange]);

  const handleSelect = (range: DateRange | undefined) => {
    setSelectedRange(range);
  };

  const handleApply = () => {
    if (selectedRange?.from && selectedRange?.to) {
      const days = Math.round((selectedRange.to.getTime() - selectedRange.from.getTime()) / (1000 * 60 * 60 * 24)) + 1;
      const startStr = format(selectedRange.from, APP_DATE_FORMAT);
      const endStr = format(selectedRange.to, APP_DATE_FORMAT);
      onSave(startStr, endStr, days);
      setOpen(false);
    } else if (selectedRange?.from) {
      // Fallback: Treat single-date selection as a 1-day range
      const days = 1;
      const startStr = format(selectedRange.from, APP_DATE_FORMAT);
      const endStr = format(selectedRange.from, APP_DATE_FORMAT);
      onSave(startStr, endStr, days);
      setOpen(false);
    }
  };

  const handleCancel = () => {
    setSelectedRange(initialRange);
    setOpen(false);
  };

  const displayText = React.useMemo(() => {
    const fromDate = parseAnyDate(start);
    const toDate = parseAnyDate(end);
    if (fromDate && toDate) {
      return `${format(fromDate, APP_DATE_FORMAT)} - ${format(toDate, APP_DATE_FORMAT)}`;
    }
    return "No dates";
  }, [start, end]);

  if (disabled) {
    return (
      <span className="text-[10px] text-muted-foreground whitespace-nowrap">
        {displayText}
      </span>
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          className={cn(
            "text-[10px] text-muted-foreground whitespace-nowrap hover:text-foreground hover:underline focus:outline-none focus:ring-1 focus:ring-ring rounded px-1 -mx-1",
            open && "text-foreground bg-neutral-100 dark:bg-neutral-800"
          )}
        >
          {displayText}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0 flex flex-col max-h-[min(94vh,420px)] overflow-hidden" align="start" collisionPadding={12}>
        <div className="overflow-y-auto p-3 flex-1">
          <Calendar
            mode="range"
            selected={selectedRange}
            onSelect={handleSelect}
            initialFocus
          />
        </div>
        <div className="flex items-center justify-end gap-2 border-t p-3 bg-neutral-50 dark:bg-neutral-900 rounded-b-md">
          <button
            onClick={handleCancel}
            className="px-2.5 py-1 text-xs font-medium rounded hover:bg-neutral-100 dark:hover:bg-neutral-800 text-muted-foreground transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleApply}
            disabled={!selectedRange?.from}
            className="px-3 py-1 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded transition-colors shadow-sm"
          >
            Apply
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
