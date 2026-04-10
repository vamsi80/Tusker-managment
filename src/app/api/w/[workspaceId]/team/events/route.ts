import { NextRequest } from "next/server";
import { teamEvents, TEAM_UPDATE, TeamEventData } from "@/lib/realtime";

export const dynamic = "force-dynamic";

export async function GET(
    req: NextRequest,
    { params }: { params: Promise<{ workspaceId: string }> }
) {
    const { workspaceId } = await params;

    const stream = new ReadableStream({
        async start(controller) {
            const encoder = new TextEncoder();

            const listener = (data: TeamEventData) => {
                if (data.workspaceId === workspaceId) {
                    controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
                }
            };

            teamEvents.on(TEAM_UPDATE, listener);

            // Initial connection signal
            controller.enqueue(encoder.encode("data: connected\n\n"));

            // Keep alive ping
            const keepAlive = setInterval(() => {
                controller.enqueue(encoder.encode("data: ping\n\n"));
            }, 30000);

            req.signal.addEventListener("abort", () => {
                teamEvents.off(TEAM_UPDATE, listener);
                clearInterval(keepAlive);
                controller.close();
            });
        },
    });

    return new Response(stream, {
        headers: {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
        },
    });
}
