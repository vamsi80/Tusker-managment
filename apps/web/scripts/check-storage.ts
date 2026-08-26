import "dotenv/config";
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, ListObjectsV2Command } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

/**
 * Object storage connectivity check.
 *
 * Round-trips a tiny object through a presigned PUT — the same path the browser
 * uses — so credentials, bucket name, endpoint and signing are all proven at once.
 * Run after filling in the S3_* / AWS_* keys in .env:
 *
 *   npx tsx scripts/check-storage.ts
 */

const { AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_REGION, S3_BUCKET_NAME, S3_ENDPOINT } = process.env;

async function main() {
    console.log("--- Object Storage Check ---");

    const missing = Object.entries({ AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, S3_BUCKET_NAME })
        .filter(([, v]) => !v)
        .map(([k]) => k);

    if (missing.length) {
        console.error(`❌ Missing in .env: ${missing.join(", ")}`);
        process.exit(1);
    }

    // Matches src/lib/storage/s3.ts: any path on the endpoint (Cloudflare appends the
    // bucket to the URL it shows you) would double the bucket into every object key.
    const endpoint = S3_ENDPOINT ? new URL(S3_ENDPOINT).origin : undefined;

    console.log(`Bucket:   ${S3_BUCKET_NAME}`);
    console.log(`Endpoint: ${endpoint || "(AWS default)"}`);
    if (S3_ENDPOINT && endpoint !== S3_ENDPOINT.replace(/\/$/, "")) {
        console.log(`          (path stripped from S3_ENDPOINT: ${S3_ENDPOINT})`);
    }
    console.log(`Region:   ${AWS_REGION || "auto"}`);

    const client = new S3Client({
        region: AWS_REGION || "auto",
        endpoint,
        forcePathStyle: !!endpoint,
        credentials: {
            accessKeyId: AWS_ACCESS_KEY_ID!,
            secretAccessKey: AWS_SECRET_ACCESS_KEY!,
        },
    });

    const key = `_healthcheck/${Date.now()}.txt`;
    const body = "tusker storage check";

    try {
        // 1. Presigned PUT — exactly what the browser does when a file is attached.
        const putUrl = await getSignedUrl(
            client,
            new PutObjectCommand({ Bucket: S3_BUCKET_NAME!, Key: key, ContentType: "text/plain" }),
            { expiresIn: 60 }
        );
        const put = await fetch(putUrl, {
            method: "PUT",
            headers: { "Content-Type": "text/plain" },
            body,
        });
        if (!put.ok) throw new Error(`Presigned PUT failed: ${put.status} ${await put.text()}`);
        console.log("✅ Upload (presigned PUT) works");

        // 2. The object must land at exactly the key we asked for — a doubled bucket
        // prefix still reads back fine, but silently escapes the lifecycle rule's scope.
        const listed = await client.send(new ListObjectsV2Command({ Bucket: S3_BUCKET_NAME!, Prefix: "_healthcheck/" }));
        const landed = (listed.Contents || []).map((o) => o.Key);
        if (!landed.includes(key)) {
            throw new Error(`Object landed at ${landed.join(", ") || "(nothing)"} instead of ${key}`);
        }
        console.log("✅ Objects land at the expected key");

        // 3. Presigned GET — what View/Download redirect to.
        const getUrl = await getSignedUrl(client, new GetObjectCommand({ Bucket: S3_BUCKET_NAME!, Key: key }), { expiresIn: 60 });
        const got = await fetch(getUrl);
        const text = await got.text();
        if (text !== body) throw new Error(`Download returned unexpected content: ${text.slice(0, 80)}`);
        console.log("✅ Download (presigned GET) works");

        await client.send(new DeleteObjectCommand({ Bucket: S3_BUCKET_NAME!, Key: key }));
        console.log("✅ Cleanup works");

        console.log("");
        console.log("Storage is configured correctly.");
        console.log("Note: browser CORS cannot be tested from Node — attach a file in the app to confirm the bucket's CORS policy.");
    } catch (error: any) {
        console.error("❌ Storage check failed");
        console.error(error.message);
        console.log("");
        console.log("--- Troubleshooting ---");
        const msg = String(error.message || "");
        if (msg.includes("403") || msg.includes("SignatureDoesNotMatch") || msg.includes("InvalidAccessKeyId")) {
            console.log("403 / signature error: the API token is wrong, or lacks Object Read & Write on this bucket.");
        }
        if (msg.includes("NoSuchBucket") || msg.includes("404")) {
            console.log("Bucket not found: check S3_BUCKET_NAME matches the bucket exactly (case-sensitive).");
        }
        if (msg.includes("ENOTFOUND") || msg.includes("EAI_AGAIN")) {
            console.log("DNS failure: check S3_ENDPOINT — for R2 it is https://<account-id>.r2.cloudflarestorage.com");
        }
        process.exit(1);
    }
}

main();
