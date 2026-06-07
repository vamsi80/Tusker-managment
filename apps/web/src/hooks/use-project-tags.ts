"use client";

import { useEffect, useState } from "react";
import { workspacesClient } from "@/lib/api-client/workspaces";

export interface TagOption {
  id: string;
  name: string;
}

// Module-level cache: deduplicates concurrent calls with identical args.
// The Promise is deleted after it resolves so subsequent navigations re-fetch.
const pendingFetches = new Map<string, Promise<TagOption[]>>();

export function useProjectTags(workspaceId: string, projectId?: string) {
  const [tags, setTags] = useState<TagOption[]>([]);

  useEffect(() => {
    if (!workspaceId) {
      setTags([]);
      return;
    }

    const key = `${workspaceId}:${projectId ?? ""}`;
    let mounted = true;

    const run = async () => {
      let p = pendingFetches.get(key);
      if (!p) {
        p = workspacesClient
          .getTags(workspaceId, projectId)
          .then((r) => r.map((t) => ({ id: t.id, name: t.name })));
        pendingFetches.set(key, p);
        p.finally(() => pendingFetches.delete(key));
      }
      try {
        const result = await p;
        if (mounted) setTags(result);
      } catch (error) {
        console.error("Failed to fetch tags for project/workspace:", error);
      }
    };

    run();

    return () => {
      mounted = false;
    };
  }, [workspaceId, projectId]);

  return tags;
}
