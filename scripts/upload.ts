#!/usr/bin/env tsx
/**
 * Upload local assets/ directory to Cloudflare R2.
 *
 * Usage (from repo root):
 *   npm run upload
 *   FORCE=1 npm run upload
 *
 * Required env vars:
 *   R2_ACCESS_KEY_ID
 *   R2_SECRET_ACCESS_KEY
 */
import { S3Client, PutObjectCommand, ListObjectsV2Command } from "@aws-sdk/client-s3";
import { readdirSync, readFileSync, statSync } from "fs";
import { resolve, relative, extname, sep } from "path";

const ACCOUNT_ID = "668ecbb1536f431b765200f8b2f9fa97";
const BUCKET = "hsr-randomizer-assets";
const ASSETS_DIR = resolve(process.cwd(), "assets");
const FORCE = process.env.FORCE === "1";

const CONTENT_TYPES: Record<string, string> = {
  ".webp": "image/webp",
  ".png": "image/png",
  ".json": "application/json",
};

const IMMUTABLE_CACHE = "public, max-age=31536000, immutable";

// The character-data pointer (data/<lang>/version.json) changes in place, so it
// is always re-uploaded and must be revalidated rather than cached immutably.
// Everything else (images, content-hashed json) is immutable.
const NO_CACHE = "no-cache";
const ALWAYS_UPLOAD = /^data\/[^/]+\/version\.json$/;

const client = new S3Client({
  region: "auto",
  endpoint: `https://${ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
  },
});

async function getExistingKeys(): Promise<Set<string>> {
  const keys = new Set<string>();
  let continuationToken: string | undefined;
  do {
    const res = await client.send(new ListObjectsV2Command({
      Bucket: BUCKET,
      ContinuationToken: continuationToken,
    }));
    for (const obj of res.Contents ?? []) {
      if (obj.Key) keys.add(obj.Key);
    }
    continuationToken = res.NextContinuationToken;
  } while (continuationToken);
  return keys;
}

function walkDir(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const fullPath = resolve(dir, name);
    return statSync(fullPath).isDirectory() ? walkDir(fullPath) : [fullPath];
  });
}

async function main() {
  if (!process.env.R2_ACCESS_KEY_ID || !process.env.R2_SECRET_ACCESS_KEY) {
    throw new Error("R2_ACCESS_KEY_ID and R2_SECRET_ACCESS_KEY must be set");
  }

  console.log("Fetching existing keys from R2...");
  const existing = FORCE ? new Set<string>() : await getExistingKeys();
  console.log(`${existing.size} files already in bucket\n`);

  const files = walkDir(ASSETS_DIR);
  let uploaded = 0;
  let skipped = 0;

  for (const file of files) {
    const key = relative(ASSETS_DIR, file).split(sep).join("/");
    const cacheControl = ALWAYS_UPLOAD.test(key) ? NO_CACHE : undefined;

    // Immutable assets are content-addressed, so an existing key means the
    // bytes are unchanged. The version pointer is always re-uploaded.
    if (!cacheControl && existing.has(key)) {
      console.log(`  ↷ ${key} — exists, skipping`);
      skipped++;
      continue;
    }

    const ext = extname(file);
    await client.send(new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      Body: readFileSync(file),
      ContentType: CONTENT_TYPES[ext] ?? "application/octet-stream",
      CacheControl: cacheControl ?? IMMUTABLE_CACHE,
    }));

    console.log(`  ✓ ${key}`);
    uploaded++;
  }

  console.log(`\n✓ Done. ${uploaded} uploaded, ${skipped} skipped.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
