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
import { TopLoader } from "@/components/shared/top-loader";

interface WorkspaceShellProps {
  children: React.ReactNode;
  workspaceId: string;
  initialData?: any;
}

export function WorkspaceShell({ children, workspaceId, initialData }: WorkspaceShellProps) {
  return (
    <WorkspaceLayoutProvider workspaceId={workspaceId} initialData={initialData}>
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
      <TopLoader />
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

        <SidebarInset className="relative flex min-h-svh flex-1 flex-col bg-background overflow-hidden transition-all duration-300">
          <SiteHeader />
          <main className="flex flex-1 flex-col overflow-y-auto overflow-x-hidden w-full h-full">
            <div className="@container/main h-full w-full flex-1 flex flex-col">
              <div className="flex h-full grow flex-col gap-6 py-6 px-4 sm:px-6 lg:px-8 w-full max-w-none animate-in fade-in duration-500 flex-1">
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
