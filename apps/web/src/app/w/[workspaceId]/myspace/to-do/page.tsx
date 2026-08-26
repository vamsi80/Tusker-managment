"use client";

import { use } from "react";
import { PersonalListContainer } from "../_components/personal-list-container";

interface PageProps {
  params: Promise<{ workspaceId: string }>;
}

export default function MySpaceTodosPage({ params }: PageProps) {
  const { workspaceId } = use(params);

  return (
    <div className="size-full animate-in fade-in slide-in-from-bottom-4 duration-500 px-2">
      <PersonalListContainer workspaceId={workspaceId} hideHeader />
    </div>
  );
}
