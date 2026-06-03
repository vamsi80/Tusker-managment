import PusherClient from "pusher-js";

const isClientConfigured = !!(
    process.env.NEXT_PUBLIC_PUSHER_KEY &&
    process.env.NEXT_PUBLIC_PUSHER_CLUSTER
);

// Server-side Pusher is handled by the CF Worker API — not needed in the web app.
export const pusherServer = null;

export const pusherClient = (() => {
    if (typeof window === "undefined") return null;

    if (!isClientConfigured) {
        if (process.env.NODE_ENV === "development") {
            console.log("[PUSHER] Client: MOCK (keys missing)");
            return {
                subscribe: () => ({ bind: () => {} }),
                unsubscribe: () => {},
                bind: () => {},
                unbind: () => {},
            } as unknown as PusherClient;
        }
        return null;
    }

    try {
        return new PusherClient(process.env.NEXT_PUBLIC_PUSHER_KEY!, {
            cluster: process.env.NEXT_PUBLIC_PUSHER_CLUSTER!,
        });
    } catch (error) {
        console.error("Failed to instantiate Pusher client:", error);
        return null;
    }
})();
