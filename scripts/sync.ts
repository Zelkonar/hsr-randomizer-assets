#!/usr/bin/env tsx
/**
 * Download character images and element/path icons from StarRailRes, convert to
 * webp, and write them into the upload tree (assets/characters/).
 *
 * By default only characters that are not yet live on the CDN are processed, so
 * a daily run does no work until a new character ships. Use FORCE=1 to
 * re-download and overwrite everyone (e.g. to re-compress at new quality).
 *
 * Usage (from repo root):
 *   npm run sync
 *   FORCE=1 npm run sync
 *   FORCE=1 SYNC_ONLY=portrait npm run sync
 */
import sharp from "sharp";
import { writeFileSync, mkdirSync, existsSync } from "fs";
import { resolve } from "path";
import { fileURLToPath } from "url";
import { RAW_BASE, RawCharacter, fetchRawIndex, fetchDeployed } from "./data";
import { withConcurrency } from "./script-utils";

const OUT_ROOT = resolve(process.cwd(), "assets");
const FORCE = process.env.FORCE === "1";
const SYNC_ONLY = process.env.SYNC_ONLY?.trim();
const CONCURRENCY = 5;

const VARIANTS = [
  { dir: "icon", field: "icon" as const, quality: 85 },
  { dir: "preview", field: "preview" as const, quality: 80 },
  { dir: "portrait", field: "portrait" as const, quality: 68, maxWidth: 640 },
] as const;

type Variant = (typeof VARIANTS)[number];

function variantsToSync(): Variant[] {
  if (!SYNC_ONLY) return [...VARIANTS];
  const filtered = VARIANTS.filter((v) => v.dir === SYNC_ONLY);
  if (!filtered.length) throw new Error(`Unknown SYNC_ONLY="${SYNC_ONLY}" (use icon, preview, or portrait)`);
  return filtered;
}

async function convertVariant(character: RawCharacter, variant: Variant): Promise<void> {
  const outDir = resolve(OUT_ROOT, "characters", variant.dir);
  const outPath = resolve(outDir, `${character.id}.webp`);

  if (!FORCE && existsSync(outPath)) {
    console.log(`  ↷ ${variant.dir}/${character.id} — exists, skipping`);
    return;
  }

  const res = await fetch(`${RAW_BASE}/${character[variant.field]}`);
  if (!res.ok) throw new Error(`Failed to fetch: ${res.status}`);

  const original = Buffer.from(await res.arrayBuffer());
  let pipeline = sharp(original);
  if ("maxWidth" in variant && variant.maxWidth)
    pipeline = pipeline.resize({ width: variant.maxWidth, withoutEnlargement: true });
  const webp = await pipeline.webp({ quality: variant.quality, effort: 4 }).toBuffer();

  mkdirSync(outDir, { recursive: true });
  writeFileSync(outPath, webp);
  console.log(`  ✓ ${variant.dir}/${character.id} (${character.name}) — ${Math.round(original.byteLength / 1024)}KB → ${Math.round(webp.byteLength / 1024)}KB`);
}

export async function main() {
  console.log(`Output: ${OUT_ROOT}\n`);

  const raw = await fetchRawIndex();
  console.log(`Fetched ${raw.length} characters.`);

  // Only process characters that are not already live. A new character is the
  // only thing that adds images, and it always appears as a new id here, so
  // diffing against the deployed id set avoids re-downloading everyone on every
  // run. FORCE bypasses the diff to rebuild the whole set.
  let targets = raw;
  if (FORCE) {
    console.log("FORCE=1 — syncing all characters, overwriting existing files");
  } else {
    const deployed = await fetchDeployed();
    if (!deployed) {
      console.log("No deployed data found — syncing all characters.");
    } else {
      targets = raw.filter((c) => !deployed.ids.has(Number(c.id)));
      console.log(`${deployed.ids.size} already deployed; ${targets.length} new to sync.`);
      if (targets.length === 0) {
        console.log("Nothing new to sync.");
        return;
      }
    }
  }

  if (SYNC_ONLY) console.log(`SYNC_ONLY=${SYNC_ONLY}`);

  const tasks = targets.flatMap((c) => variantsToSync().map((v) => () => convertVariant(c, v)));
  await withConcurrency(tasks, CONCURRENCY);

  console.log("\n✓ Done. Run npm run upload to push new files to R2.");
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
