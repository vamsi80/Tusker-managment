"use server";

import { TagService, updateTagSchema } from "@tusker/core/server/services/tag/tag.service";
import { getSession } from "@/lib/auth/require-user";
import { z } from "zod";

export async function updateTag(data: z.input<typeof updateTagSchema>) {
    const session = await getSession();
    if (!session) throw new Error("Unauthorized");
    return TagService.updateTag(session.user.id, data);
}
