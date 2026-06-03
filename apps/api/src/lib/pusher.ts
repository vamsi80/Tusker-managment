import PusherServer from "pusher";

export function createPusherClient(env: {
    PUSHER_APP_ID: string;
    PUSHER_KEY: string;
    PUSHER_SECRET: string;
    PUSHER_CLUSTER: string;
}): PusherServer {
    return new PusherServer({
        appId: env.PUSHER_APP_ID,
        key: env.PUSHER_KEY,
        secret: env.PUSHER_SECRET,
        cluster: env.PUSHER_CLUSTER,
        useTLS: true,
    });
}
