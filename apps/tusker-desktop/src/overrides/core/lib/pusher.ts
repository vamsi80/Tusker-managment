/**
 * Stands in for packages/core/src/lib/pusher.ts in the desktop renderer. The
 * original also builds the server client (the "pusher" Node package) at import
 * time, which can't run in a window; only the browser client is kept, with the
 * same channels the website uses.
 */
import PusherClient from "pusher-js";

const key = (import.meta.env.VITE_PUSHER_KEY ?? "").trim();
const cluster = (import.meta.env.VITE_PUSHER_CLUSTER ?? "ap2").trim();

export const pusherServer = null;

export const pusherClient = key ? new PusherClient(key, { cluster }) : null;
