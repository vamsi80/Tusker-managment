import * as React from "react";
import { Check, ChevronsUpDown, X, Plus, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Command,
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
import { workspacesClient } from "@/lib/api-client/workspaces";
import { apiFetch } from "@/lib/api-client/fetch-wrapper";
import { toast } from "sonner";

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
  workspaceId?: string;
  projectId?: string;
  onTagOptionAdded?: (tag: Option) => void;
}

export function MultiSelectTags({
  options,
  selected,
  onChange,
  placeholder = "Select tags...",
  className,
  workspaceId,
  projectId,
  onTagOptionAdded,
}: MultiSelectTagsProps) {
  const [open, setOpen] = React.useState(false);
  const [search, setSearch] = React.useState("");
  const [allWorkspaceTags, setAllWorkspaceTags] = React.useState<Option[]>([]);
  const [isProcessing, setIsProcessing] = React.useState(false);

  // Fetch all workspace tags when popover opens and workspaceId is provided
  React.useEffect(() => {
    if (open && workspaceId) {
      workspacesClient.getTags(workspaceId).then((tags) => {
        setAllWorkspaceTags(tags.map(t => ({ id: t.id, name: t.name })));
      }).catch(err => {
        console.error("Failed to load workspace tags:", err);
      });
    }
  }, [open, workspaceId]);

  const handleUnselect = (id: string) => {
    onChange(selected.filter((s) => s !== id));
  };

  const handleAddOrCreateTag = async (tagName: string, isCreate: boolean) => {
    if (!workspaceId || !projectId || isProcessing) return;
    setIsProcessing(true);
    try {
      const response = await apiFetch<{ success: boolean; data: any }>("/workspace-tags", {
        method: "POST",
        body: JSON.stringify({
          name: tagName,
          workspaceId,
          projectId,
        }),
      });

      if (response.success && response.data) {
        const newTag = { id: response.data.id, name: response.data.name };
        
        // Notify parent to append to local tags list
        onTagOptionAdded?.(newTag);
        
        // Add to selected tags
        onChange([...selected, newTag.id]);
        
        toast.success(isCreate ? `Tag "${tagName}" created & added to project` : `Tag "${tagName}" added to project`);
        setSearch("");
      } else {
        toast.error("Failed to process tag");
      }
    } catch (err: any) {
      toast.error(err.message || "An error occurred");
    } finally {
      setIsProcessing(false);
    }
  };

  const selectedOptions = options.filter((option) => selected.includes(option.id));

  // Manual filtering of options
  const filteredOptions = options.filter(option =>
    option.name.toLowerCase().includes(search.toLowerCase())
  );

  const searchTrimmed = search.trim();
  const hasSearch = searchTrimmed.length > 0;

  const exactProjectMatch = options.some(
    (o) => o.name.toLowerCase() === searchTrimmed.toLowerCase()
  );

  // Find all workspace tags that match the search query (case-insensitive) but are NOT already in the project
  const projectTagNames = new Set(options.map(o => o.name.toLowerCase()));
  const matchingWorkspaceTagsNotInProject = hasSearch
    ? allWorkspaceTags.filter(tag =>
        tag.name.toLowerCase().includes(search.toLowerCase()) &&
        !projectTagNames.has(tag.name.toLowerCase())
      )
    : [];

  // Check if there is an exact match in the workspace (case-insensitive)
  const exactWorkspaceMatch = allWorkspaceTags.some(
    (tag) => tag.name.toLowerCase() === searchTrimmed.toLowerCase()
  );

  // Show create option if there is a search term and it matches neither project tags nor workspace tags
  const showCreateOption = hasSearch && !exactProjectMatch && !exactWorkspaceMatch && workspaceId && projectId;

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            aria-controls="tags-listbox"
            className={cn(
              "w-full justify-between h-auto min-h-8 py-1 px-2 transition-all duration-200",
              "border border-muted-foreground/20 hover:border-primary/50 hover:bg-accent/50",
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
                      <X className="size-2.5" />
                    </div>
                  </Badge>
                ))
              ) : (
                <span className="text-muted-foreground/60 text-xs">{placeholder}</span>
              )}
            </div>
            <ChevronsUpDown className="ml-2 size-4 shrink-0 opacity-40 group-hover:opacity-100 transition-opacity" />
          </Button>
        </PopoverTrigger>
        <PopoverContent 
          className="p-0 shadow-2xl border border-primary/20 backdrop-blur-xl bg-background/95 overflow-hidden animate-in fade-in zoom-in-95 duration-200" 
          align="start"
          style={{ width: "max(var(--radix-popover-trigger-width), 250px)" }}
        >
          <Command className="bg-transparent" shouldFilter={false}>
            <div className="flex items-center border-b border-primary/10 px-3">
              <CommandInput 
                placeholder="Search tags..." 
                className="h-10 border-none focus:ring-0 text-sm"
                value={search}
                onValueChange={setSearch}
              />
            </div>
            <CommandList id="tags-listbox">
              {filteredOptions.length === 0 &&
                matchingWorkspaceTagsNotInProject.length === 0 &&
                !showCreateOption && (
                  <div className="py-6 text-center text-sm text-muted-foreground animate-in fade-in duration-300">
                    No tags found.
                  </div>
                )}
              
              {filteredOptions.length > 0 && (
                <CommandGroup heading="Project Tags" className="p-1.5 text-muted-foreground">
                  {filteredOptions.map((option) => {
                    const isSelected = selected.includes(option.id);
                    return (
                      <CommandItem
                        key={option.id}
                        className={cn(
                          "flex items-center gap-2 px-2 py-2 rounded-md cursor-pointer transition-colors text-foreground",
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
                          "flex size-4 items-center justify-center rounded border border-primary/30 transition-all duration-200",
                          isSelected ? "bg-primary border-primary" : "bg-transparent"
                        )}>
                          <Check
                            className={cn(
                              "size-3 text-primary-foreground transition-transform duration-200",
                              isSelected ? "scale-100 opacity-100" : "scale-0 opacity-0"
                            )}
                          />
                        </div>
                        <span className="flex-1">{option.name}</span>
                      </CommandItem>
                    );
                  })}
                </CommandGroup>
              )}

              {matchingWorkspaceTagsNotInProject.length > 0 && (
                <CommandGroup heading="Existing Workspace Tags" className="p-1.5 border-t border-primary/5 text-muted-foreground">
                  {matchingWorkspaceTagsNotInProject.map((tag) => (
                    <CommandItem
                      key={tag.id}
                      className={cn(
                        "flex items-center gap-2 px-2 py-2 rounded-md cursor-pointer text-primary hover:bg-primary/5 transition-colors",
                        isProcessing && "opacity-50 cursor-not-allowed"
                      )}
                      disabled={isProcessing}
                      onSelect={() => handleAddOrCreateTag(tag.name, false)}
                    >
                      {isProcessing ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        <Plus className="size-4" />
                      )}
                      <span className="flex-1 text-sm font-medium">
                        Add to project: "{tag.name}"
                      </span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}

              {showCreateOption && (
                <CommandGroup heading="New Tag" className="p-1.5 border-t border-primary/5 text-muted-foreground">
                  <CommandItem
                    className={cn(
                      "flex items-center gap-2 px-2 py-2 rounded-md cursor-pointer text-primary hover:bg-primary/5 transition-colors",
                      isProcessing && "opacity-50 cursor-not-allowed"
                    )}
                    disabled={isProcessing}
                    onSelect={() => handleAddOrCreateTag(searchTrimmed, true)}
                  >
                    {isProcessing ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <Plus className="size-4" />
                    )}
                    <span className="flex-1 text-sm font-medium">
                      Create tag: "{searchTrimmed}"
                    </span>
                  </CommandItem>
                </CommandGroup>
              )}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
}

