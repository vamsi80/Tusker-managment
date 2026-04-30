"use client";

import * as React from "react";
import { Check, ChevronsUpDown, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";

export type Option = {
  id: string;
  name: string;
};

interface MultiSelectTagsProps {
  options: Option[];
  selected: string[];
  onChange: (selected: string[]) => void;
  placeholder?: string;
  className?: string;
}

export function MultiSelectTags({
  options,
  selected,
  onChange,
  placeholder = "Select tags...",
  className,
}: MultiSelectTagsProps) {
  const [open, setOpen] = React.useState(false);

  const handleUnselect = (id: string) => {
    onChange(selected.filter((s) => s !== id));
  };

  const selectedOptions = options.filter((option) => selected.includes(option.id));

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className={cn(
              "w-full justify-between h-auto min-h-10 py-2 px-3 transition-all duration-200",
              "border-muted-foreground/20 hover:border-primary/50 hover:bg-accent/50",
              "focus-visible:ring-offset-0 focus-visible:ring-1 focus-visible:ring-primary/30",
              open && "border-primary/50 ring-1 ring-primary/30 bg-accent/50"
            )}
          >
            <div className="flex flex-wrap gap-1.5 items-center">
              {selectedOptions.length > 0 ? (
                selectedOptions.map((option) => (
                  <Badge
                    key={option.id}
                    variant="secondary"
                    className={cn(
                      "group flex items-center gap-1 pl-2 pr-1 py-0.5 transition-all duration-200",
                      "bg-primary/10 text-primary hover:bg-primary hover:text-primary-foreground border-transparent",
                      "animate-in fade-in zoom-in-95 duration-200"
                    )}
                  >
                    <span className="text-[11px] font-medium">{option.name}</span>
                    <div
                      role="button"
                      tabIndex={0}
                      className="rounded-full hover:bg-black/10 dark:hover:bg-white/20 p-0.5 transition-colors cursor-pointer"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleUnselect(option.id);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.stopPropagation();
                          handleUnselect(option.id);
                        }
                      }}
                    >
                      <X className="h-2.5 w-2.5" />
                    </div>
                  </Badge>
                ))
              ) : (
                <span className="text-muted-foreground/60 text-sm">{placeholder}</span>
              )}
            </div>
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-40 group-hover:opacity-100 transition-opacity" />
          </Button>
        </PopoverTrigger>
        <PopoverContent 
          className="p-0 shadow-2xl border-primary/20 backdrop-blur-xl bg-background/95 overflow-hidden animate-in fade-in zoom-in-95 duration-200" 
          align="start"
          style={{ width: "max(var(--radix-popover-trigger-width), 250px)" }}
        >
          <Command className="bg-transparent">
            <div className="flex items-center border-b border-primary/10 px-3">
              <CommandInput 
                placeholder="Search tags..." 
                className="h-10 border-none focus:ring-0 text-sm"
              />
            </div>
            <CommandList>
              <CommandEmpty className="py-6 text-center text-sm text-muted-foreground animate-in fade-in duration-300">
                No tags found.
              </CommandEmpty>
              <CommandGroup className="p-1.5">
                {options.map((option) => {
                  const isSelected = selected.includes(option.id);
                  return (
                    <CommandItem
                      key={option.id}
                      className={cn(
                        "flex items-center gap-2 px-2 py-2 rounded-md cursor-pointer transition-colors",
                        "hover:bg-primary/5 aria-selected:bg-primary/10",
                        isSelected && "text-primary font-medium"
                      )}
                      onSelect={() => {
                        onChange(
                          isSelected
                            ? selected.filter((s) => s !== option.id)
                            : [...selected, option.id]
                        );
                      }}
                    >
                      <div className={cn(
                        "flex h-4 w-4 items-center justify-center rounded border border-primary/30 transition-all duration-200",
                        isSelected ? "bg-primary border-primary" : "bg-transparent"
                      )}>
                        <Check
                          className={cn(
                            "h-3 w-3 text-primary-foreground transition-transform duration-200",
                            isSelected ? "scale-100 opacity-100" : "scale-0 opacity-0"
                          )}
                        />
                      </div>
                      <span className="flex-1">{option.name}</span>
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
}
