import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { env } from "@/lib/env";

/**
 * S3-compatible object storage (Cloudflare R2).
 *
 * Files are uploaded straight from the browser with a presigned PUT and read
 * back through a presigned GET, so bytes never pass through the Next.js server
 * (serverless request bodies cap out around 4.5MB — well below a site video).
 * The bucket stays private: every URL here is short-lived and signed.
 */

const SIGNED_URL_TTL = 300; // seconds

export const isStorageConfigured = () =>
    !!(env.AWS_ACCESS_KEY_ID && env.AWS_SECRET_ACCESS_KEY && env.S3_BUCKET_NAME);

let client: S3Client | null = null;

function getClient() {
    if (!isStorageConfigured()) {
        throw new Error("Object storage is not configured (S3_BUCKET_NAME / AWS credentials missing)");
    }
    if (!client) {
        // Cloudflare shows the S3 API URL with the bucket appended
        // (https://<account>.r2.cloudflarestorage.com/<bucket>). Left as-is, the SDK
        // appends the bucket a second time and every key silently gains a "<bucket>/"
        // prefix — putting objects outside the lifecycle rule's prefix scope, so they
        // would never expire. Keep the origin only.
        const endpoint = env.S3_ENDPOINT ? new URL(env.S3_ENDPOINT).origin : undefined;

        client = new S3Client({
            // R2 ignores the region but the SDK requires one.
            region: env.AWS_REGION || "auto",
            endpoint,
            forcePathStyle: !!endpoint,
            credentials: {
                accessKeyId: env.AWS_ACCESS_KEY_ID!,
                secretAccessKey: env.AWS_SECRET_ACCESS_KEY!,
            },
        });
    }
    return client;
}

/** Presigned PUT. The signature pins Content-Type, so the upload cannot deviate from what was approved. */
export function presignUpload(key: string, mime: string) {
    return getSignedUrl(
        getClient(),
        new PutObjectCommand({ Bucket: env.S3_BUCKET_NAME!, Key: key, ContentType: mime }),
        { expiresIn: SIGNED_URL_TTL }
    );
}

/** Presigned GET. `download` forces a save dialog with the original filename instead of inline rendering. */
export function presignDownload(key: string, opts?: { download?: boolean; filename?: string }) {
    const filename = (opts?.filename || key.split("/").pop() || "file").replace(/"/g, "");
    return getSignedUrl(
        getClient(),
        new GetObjectCommand({
            Bucket: env.S3_BUCKET_NAME!,
            Key: key,
            ResponseContentDisposition: `${opts?.download ? "attachment" : "inline"}; filename="${filename}"`,
        }),
        { expiresIn: SIGNED_URL_TTL }
    );
}
