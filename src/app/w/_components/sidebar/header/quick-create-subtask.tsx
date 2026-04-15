"use client";

import { PlusCircle, Loader2 } from "lucide-react";
import { CreateSubTaskForm } from "@/app/w/[workspaceId]/p/[slug]/_components/forms/create-subTask-form";
import { SidebarMenuButton } from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useState } from "react";
import type { WorkspaceTaskCreationData } from "@/data/workspace/get-workspace-task-creation-data";

interface QuickCreateSubTaskProps {
  workspaceId: string;
  initialData?: WorkspaceTaskCreationData | null;
  isLoading?: boolean;
  error?: boolean;
}

export function QuickCreateSubTask({
  workspaceId,
  initialData,
  isLoading: initialIsLoading,
  error: initialError,
}: QuickCreateSubTaskProps) {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<WorkspaceTaskCreationData | null>(
    initialData ?? null,
  );
  const [isLoading, setIsLoading] = useState(initialIsLoading ?? false);
  const [hasError, setHasError] = useState(initialError ?? false);

  const handleOpenChange = (isOpen: boolean) => {
    if (isLoading || isOpen === open) return;
    setOpen(isOpen);
  };

  const handleRetry = () => {
    // Trigger parent to reload by closing and reopening
    setOpen(false);
    setTimeout(() => {
      setOpen(true);
    }, 100);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <SidebarMenuButton
        tooltip="Quick Create SubTask"
        className="bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground active:bg-primary/90 active:text-primary-foreground min-w-8 duration-200 ease-linear shadow-sm cursor-pointer"
        asChild
      >
        <DialogTrigger asChild>
          <Button className="w-full justify-start h-auto p-2 bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground border-0">
            <PlusCircle size={20} />
            <span className="font-semibold">Quick Create SubTask</span>
          </Button>
        </DialogTrigger>
      </SidebarMenuButton>
      <DialogContent className="max-h-[98vh] w-[min(900px,95vw)] overflow-hidden">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-12 gap-3">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">
              Loading form data...
            </p>
          </div>
        ) : hasError ? (
          <div className="flex flex-col items-center justify-center py-12 gap-3">
            <p className="text-sm text-destructive">
              Failed to load data. Please try again.
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleOpenChange(true)}
            >
              Retry
            </Button>
          </div>
        ) : data && data.parentTasks.length > 0 ? (
          <CreateSubTaskForm
            workspaceId={workspaceId}
            members={data.members as any}
            tags={data.tags}
            parentTasks={data.parentTasks}
            projects={data.projects}
            level="workspace"
            dialogOpen={open}
            onDialogOpenChange={setOpen}
          />
        ) : data ? (
          <div className="flex flex-col items-center justify-center py-12 gap-3">
            <p className="text-sm text-muted-foreground">
              No parent tasks available. Create a parent task first.
            </p>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
