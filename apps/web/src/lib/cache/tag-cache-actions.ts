"use server";

import { revalidateTag, revalidatePath } from "next/cache";
import { CacheTags } from "@/data/cache-tags";

export async function revalidateTagsCache(workspaceId: string) {
    const tags = CacheTags.workspaceTags(workspaceId);
    tags.forEach((tag: string) => revalidateTag(tag, "default"));
    revalidatePath(`/w/${workspaceId}`, "layout");
}
