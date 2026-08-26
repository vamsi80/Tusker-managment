"use client";

import { useEffect } from "react";
import { useFilterStore } from "@/lib/store/filter-store";
import { workspacesClient } from "@/lib/api-client/workspaces";

export function useWorkspaceTags(workspaceId: string) {
  const { tags, setTags, tagsFetched } = useFilterStore();

  useEffect(() => {
    if (!workspaceId || tagsFetched[workspaceId]) return;

    let mounted = true;
    const fetchTags = async () => {
      try {
        const workspaceTags = await workspacesClient.getTags(workspaceId);
        if (mounted) {
          setTags(
            workspaceTags.map((t) => ({ id: t.id, name: t.name })),
            workspaceId
          );
        }
      } catch (error) {
        console.error("Failed to fetch tags for workspace:", workspaceId, error);
      }
    };

    fetchTags();

    return () => {
      mounted = false;
    };
  }, [workspaceId, tagsFetched, setTags]);

  return tags;
}
