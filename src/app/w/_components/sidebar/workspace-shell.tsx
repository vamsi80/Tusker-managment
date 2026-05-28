"use client";

import React from "react";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "./workspace-sidebar";
import { SiteHeader } from "./header/site-header";
import { WorkspaceClientProviders } from "@/app/w/[workspaceId]/_components/workspace-client-providers";
import { DataLoadReporter } from "@/app/w/[workspaceId]/_components/data-load-reporter";
import { WorkspaceLayoutProvider } from "../../[workspaceId]/_components/workspace-layout-context";
import { TopLoader } from "@/components/shared/top-loader";
import { WorkspaceLayoutData } from "@/types/workspace";

interface WorkspaceShellProps {
  children: React.ReactNode;
  workspaceId: string;
  initialData?: WorkspaceLayoutData;
}

export function WorkspaceShell({ children, workspaceId, initialData }: WorkspaceShellProps) {
  return (
    <WorkspaceLayoutProvider workspaceId={workspaceId} initialData={initialData}>
      <WorkspaceShellContent>{children}</WorkspaceShellContent>
    </WorkspaceLayoutProvider>
  );
}

function WorkspaceShellContent({ children }: { children: React.ReactNode }) {

  return (
    <WorkspaceClientProviders>
      <DataLoadReporter />
      <TopLoader />
      <SidebarProvider
        style={
          {
            "--sidebar-width": "18rem",
            "--sidebar-width-mobile": "20rem",
            "--header-height": "3rem",
          } as React.CSSProperties
        }
      >
        <AppSidebar />

        <SidebarInset className="relative flex min-h-svh flex-1 flex-col bg-background transition-all duration-300">
          <SiteHeader />
          <main className="flex flex-1 flex-col w-full max-w-full">
            <div className="@container/main size-full flex-1 flex flex-col min-w-0">
              <div className="flex h-full grow flex-col gap-6 pb-6 px-2 sm:px-4 lg:px-6 w-full max-w-full animate-in fade-in duration-500 flex-1">
                {children}
              </div>
            </div>
          </main>
        </SidebarInset>
      </SidebarProvider>
    </WorkspaceClientProviders>
  );
}

