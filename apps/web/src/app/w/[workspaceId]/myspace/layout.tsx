"use client";

import { use } from "react";
import { MySpaceNav } from "./_components/myspace-nav";
import { usePathname } from "next/navigation";

interface LayoutProps {
  children: React.ReactNode;
  params: Promise<{ workspaceId: string }>;
}

export default function MySpaceLayout({ children, params }: LayoutProps) {
  const { workspaceId } = use(params);

  return (
    <div className="flex flex-col h-full bg-background animate-in fade-in duration-500">
      <MySpaceNav workspaceId={workspaceId} />

      {/* Content Area */}
      <div className="flex-1 w-full overflow-hidden">
        {children}
      </div>
    </div>
  );
}
