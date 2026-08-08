import "server-only";
import { createHash } from "node:crypto";
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

/**
 * Evidence storage: private S3-compatible bucket (Cloudflare R2 with EU
 * jurisdiction, or AWS S3 eu-west-2). All access via presigned URLs capped
 * at 24h (05_COMPLIANCE_SECURITY.md §3.5). Keys are namespaced by business
 * so a leaked key never crosses tenants.
 */

const s3 = new S3Client({
  region: process.env.STORAGE_REGION ?? "auto",
  endpoint: process.env.STORAGE_ENDPOINT, // e.g. https://<account>.eu.r2.cloudflarestorage.com
  credentials: {
    accessKeyId: process.env.STORAGE_ACCESS_KEY_ID ?? "",
    secretAccessKey: process.env.STORAGE_SECRET_ACCESS_KEY ?? "",
  },
});

const BUCKET = process.env.STORAGE_BUCKET ?? "cleartowork-evidence";
const MAX_URL_TTL_SECONDS = 60 * 60 * 24; // 24h hard cap

export function evidenceKey(businessId: string, checkId: string, filename: string) {
  const safe = filename.replace(/[^a-zA-Z0-9._-]/g, "_");
  return `evidence/${businessId}/${checkId}/${Date.now()}-${safe}`;
}

export function sha256(buffer: Buffer | Uint8Array) {
  return createHash("sha256").update(buffer).digest("hex");
}

export async function uploadEvidence(
  key: string,
  body: Buffer,
  contentType: string,
) {
  await s3.send(
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      Body: body,
      ContentType: contentType,
    }),
  );
  return { key, hash: sha256(body), sizeBytes: body.byteLength };
}

export async function presignedDownloadUrl(key: string, ttlSeconds = 3600) {
  const expiresIn = Math.min(ttlSeconds, MAX_URL_TTL_SECONDS);
  return getSignedUrl(s3, new GetObjectCommand({ Bucket: BUCKET, Key: key }), {
    expiresIn,
  });
}

export async function deleteObject(key: string) {
  await s3.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }));
}
