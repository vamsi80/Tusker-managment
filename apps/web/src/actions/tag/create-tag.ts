"use server";

import { TagService, createTagSchema } from "@tusker/core/server/services/tag/tag.service";
import { getSession } from "@/lib/auth/require-user";
import { z } from "zod";

export async function createTag(data: z.input<typeof createTagSchema>) {
    const session = await getSession();
    if (!session) throw new Error("Unauthorized");
    return TagService.createTag(session.user.id, data);
}
