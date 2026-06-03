import crypto from "node:crypto";

export class PusherClient {
    private appId: string;
    private key: string;
    private secret: string;
    private cluster: string;

    constructor(options: {
        appId: string;
        key: string;
        secret: string;
        cluster: string;
        useTLS?: boolean;
    }) {
        this.appId = options.appId;
        this.key = options.key;
        this.secret = options.secret;
        this.cluster = options.cluster;
    }

    async trigger(channels: string | string[], event: string, data: any): Promise<any> {
        const channelList = Array.isArray(channels) ? channels : [channels];
        
        // Pusher REST API expects data to be a JSON string
        const body = JSON.stringify({
            name: event,
            channels: channelList,
            data: typeof data === "string" ? data : JSON.stringify(data),
        });

        // 1. MD5 of request body
        const bodyMd5 = crypto.createHash("md5").update(body).digest("hex");

        // 2. Collect parameters
        const authTimestamp = Math.floor(Date.now() / 1000).toString();
        const authVersion = "1.0";

        const params = new URLSearchParams({
            auth_key: this.key,
            auth_timestamp: authTimestamp,
            auth_version: authVersion,
            body_md5: bodyMd5,
        });
        
        // 3. Sort parameters alphabetically by key
        params.sort();

        // 4. Construct string to sign: METHOD\nPATH\nQUERY_STRING
        const path = `/apps/${this.appId}/events`;
        const stringToSign = `POST\n${path}\n${params.toString()}`;

        // 5. Signature using HMAC-SHA256
        const signature = crypto
            .createHmac("sha256", this.secret)
            .update(stringToSign)
            .digest("hex");

        params.append("auth_signature", signature);

        const url = `https://api-${this.cluster}.pusher.com${path}?${params.toString()}`;

        const response = await fetch(url, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: body,
        });

        if (!response.ok) {
            const text = await response.text();
            throw new Error(`Pusher trigger failed: ${response.status} ${response.statusText} - ${text}`);
        }

        return await response.json().catch(() => ({}));
    }
}

export function createPusherClient(env: {
    PUSHER_APP_ID: string;
    PUSHER_KEY: string;
    PUSHER_SECRET: string;
    PUSHER_CLUSTER: string;
}): PusherClient {
    return new PusherClient({
        appId: env.PUSHER_APP_ID,
        key: env.PUSHER_KEY,
        secret: env.PUSHER_SECRET,
        cluster: env.PUSHER_CLUSTER,
        useTLS: true,
    });
}

