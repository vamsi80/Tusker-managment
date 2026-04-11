import PusherServer from "pusher";
import PusherClient from "pusher-js";
import { env } from "./env";

/**
 * Pusher Server instance for triggering events from the backend.
 * Only available on the server.
 */
export const pusherServer = 
  typeof window === "undefined"
    ? new PusherServer({
        appId: env.PUSHER_APP_ID,
        key: env.NEXT_PUBLIC_PUSHER_KEY,
        secret: env.PUSHER_SECRET,
        cluster: env.NEXT_PUBLIC_PUSHER_CLUSTER,
        useTLS: true,
      })
    : (null as any);

/**
 * Pusher Client instance for listening to events in the browser.
 * Only instantiated on the client.
 */
export const pusherClient = 
  typeof window !== "undefined"
    ? new PusherClient(env.NEXT_PUBLIC_PUSHER_KEY, {
        cluster: env.NEXT_PUBLIC_PUSHER_CLUSTER || "ap2",
      })
    : (null as any);
