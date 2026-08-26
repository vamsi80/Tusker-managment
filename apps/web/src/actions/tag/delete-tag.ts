"use server";

import { TagService, deleteTagSchema } from "@tusker/core/server/services/tag/tag.service";
import { getSession } from "@/lib/auth/require-user";
import { z } from "zod";

export async function deleteTag(data: z.input<typeof deleteTagSchema>) {
    const session = await getSession();
    if (!session) throw new Error("Unauthorized");
    return TagService.deleteTag(session.user.id, data);
}
