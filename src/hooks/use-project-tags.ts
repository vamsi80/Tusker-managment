"use client";

import { useEffect, useState } from "react";
import { workspacesClient } from "@/lib/api-client/workspaces";

export interface TagOption {
  id: string;
  name: string;
}

export function useProjectTags(workspaceId: string, projectId?: string) {
  const [tags, setTags] = useState<TagOption[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!workspaceId) {
      setTags([]);
      return;
    }

    let mounted = true;
    const fetchTags = async () => {
      setLoading(true);
      try {
        const workspaceTags = await workspacesClient.getTags(workspaceId, projectId);
        if (mounted) {
          setTags(workspaceTags.map((t) => ({ id: t.id, name: t.name })));
        }
      } catch (error) {
        console.error("Failed to fetch tags for project/workspace:", error);
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    };

    fetchTags();

    return () => {
      mounted = false;
    };
  }, [workspaceId, projectId]);

  return tags;
}
