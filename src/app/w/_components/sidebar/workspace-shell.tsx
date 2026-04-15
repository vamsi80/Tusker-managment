"use client";

import React from "react";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "./workspace-sidebar";
import { SiteHeader } from "./header/site-header";
import { DailyReportFAB } from "@/app/w/[workspaceId]/reports/_components/DailyReportFAB";
import { WorkspaceClientProviders } from "@/app/w/[workspaceId]/_components/workspace-client-providers";
import { DataLoadReporter } from "@/app/w/[workspaceId]/_components/data-load-reporter";
import { WorkspaceLayoutProvider, useWorkspaceLayout } from "../../[workspaceId]/_components/workspace-layout-context";
import { WorkspaceSkeleton } from "../workspace-skeleton";

interface WorkspaceShellProps {
  children: React.ReactNode;
  workspaceId: string;
}

export function WorkspaceShell({ children, workspaceId }: WorkspaceShellProps) {
  return (
    <WorkspaceLayoutProvider workspaceId={workspaceId}>
      <WorkspaceShellContent>{children}</WorkspaceShellContent>
    </WorkspaceLayoutProvider>
  );
}

function WorkspaceShellContent({ children }: { children: React.ReactNode }) {
  const { isLoading, workspaceId } = useWorkspaceLayout();

  if (isLoading) {
    return <WorkspaceSkeleton />;
  }

  return (
    <WorkspaceClientProviders>
      <DataLoadReporter />
      <SidebarProvider
        style={
          {
            "--sidebar-width": "18rem",
            "--sidebar-width-mobile": "20rem",
            "--header-height": "4rem",
          } as React.CSSProperties
        }
      >
        <AppSidebar />

        <SidebarInset className="relative flex min-h-svh flex-1 flex-col bg-background overflow-hidden">
          <SiteHeader />
          <main className="flex flex-1 flex-col overflow-y-auto overflow-x-hidden">
            <div className="@container/main h-full w-full">
              <div className="mx-auto flex h-full grow flex-col gap-6 py-6 px-4 sm:px-6 lg:px-8 max-w-7xl animate-in fade-in duration-500">
                {children}
              </div>
            </div>
          </main>
        </SidebarInset>

        <DailyReportFAB />
      </SidebarProvider>
    </WorkspaceClientProviders>
  );
}
