"use client";

import React, { useEffect, useRef } from "react";
import { SidebarInset, SidebarProvider, useSidebar } from "@/components/ui/sidebar";
import { AppSidebar } from "./workspace-sidebar";
import { SiteHeader } from "./header/site-header";
import { WorkspaceClientProviders } from "@/app/w/[workspaceId]/_components/workspace-client-providers";
import { DataLoadReporter } from "@/app/w/[workspaceId]/_components/data-load-reporter";
import { WorkspaceLayoutProvider } from "../../[workspaceId]/_components/workspace-layout-context";
import { TopLoader } from "@/components/shared/top-loader";
import { AppBackground } from "@/components/shared/app-background";
import { WorkspaceLayoutData } from "@tusker/core/types/workspace";
import { usePathname } from "next/navigation";
import { useFilterStore } from "@/lib/store/filter-store";

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

/**
 * Gmail/Outlook behaviour: between tablet and 1280px the nav drops to its icon
 * rail so the page gets the ~16rem back; widening again restores what it was.
 * A manual toggle while narrow sticks, since this only acts when the width
 * crosses the line. Reads the sidebar through a ref: setOpen changes identity
 * on every toggle, and re-running the effect would undo a manual expand.
 */
function AutoCollapseSidebar() {
  const sidebar = useSidebar();
  const latest = useRef(sidebar);
  useEffect(() => {
    latest.current = sidebar;
  });

  useEffect(() => {
    const mql = window.matchMedia("(min-width: 768px) and (max-width: 1279px)");
    let restore: boolean | null = null;
    const apply = () => {
      const { open, setOpen } = latest.current;
      if (mql.matches) {
        if (restore === null) restore = open;
        setOpen(false);
      } else if (restore !== null) {
        setOpen(restore);
        restore = null;
      }
    };
    apply();
    mql.addEventListener("change", apply);
    return () => mql.removeEventListener("change", apply);
  }, []);

  return null;
}

function WorkspaceShellContent({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const clearFilters = useFilterStore((state) => state.clearFilters);
  const setIsCurrentlyFiltered = useFilterStore((state) => state.setIsCurrentlyFiltered);
  const lastPathnameRef = useRef(pathname);

  useEffect(() => {
    if (pathname !== lastPathnameRef.current) {
      console.log(`[ROUTE_CHANGE] Pathname changed from ${lastPathnameRef.current} to ${pathname}. Resetting task filters...`);
      clearFilters();
      setIsCurrentlyFiltered(false);
      lastPathnameRef.current = pathname;
    }
  }, [pathname, clearFilters, setIsCurrentlyFiltered]);

  return (
    <WorkspaceClientProviders>
      <DataLoadReporter />
      <TopLoader />
      <SidebarProvider
        // isolate: the backdrop's -z-10 layer paints above this base colour, below the content.
        className="app-bg isolate"
        style={
          {
            "--sidebar-width": "18rem",
            "--sidebar-width-mobile": "20rem",
            "--header-height": "3rem",
          } as React.CSSProperties
        }
      >
        <AppBackground />
        <AutoCollapseSidebar />
        <AppSidebar />

        <SidebarInset className="relative flex min-h-svh flex-1 flex-col bg-transparent transition-all duration-300">
          <SiteHeader />
          <main className="flex flex-1 flex-col w-full max-w-full">
            <div className="@container/main size-full flex-1 flex flex-col min-w-0">
              <div className="flex h-full grow flex-col gap-6 pt-6 pb-8 px-4 sm:px-6 lg:px-8 w-full max-w-full animate-in fade-in duration-500 flex-1">
                {children}
              </div>
            </div>
          </main>
        </SidebarInset>
      </SidebarProvider>
    </WorkspaceClientProviders>
  );
}

