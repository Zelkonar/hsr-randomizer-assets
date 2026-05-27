#!/usr/bin/env tsx
/**
 * Download character images and element/path icons from StarRailRes.
 *
 * Usage (from repo root):
 *   npm run sync
 *   FORCE=1 npm run sync
 *   FORCE=1 SYNC_ONLY=portrait npm run sync
 */
import sharp from "sharp";
import { writeFileSync, mkdirSync, existsSync } from "fs";
import { resolve } from "path";

const RAW_BASE = "https://raw.githubusercontent.com/Mar-7th/StarRailRes/master";
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

interface RawCharacter {
  id: string;
  name: string;
  icon: string;
  preview: string;
  portrait: string;
}

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


async function withConcurrency<T>(tasks: (() => Promise<T>)[], limit: number): Promise<T[]> {
  const results: T[] = [];
  let index = 0;
  async function worker() {
    while (index < tasks.length) results[index] = await tasks[index++]();
  }
  await Promise.all(Array.from({ length: limit }, worker));
  return results;
}

async function main() {
  console.log(`Output: ${OUT_ROOT}\n`);

  const res = await fetch(`${RAW_BASE}/index_min/en/characters.json`);
  if (!res.ok) throw new Error(`Failed to fetch index: ${res.status}`);
  const raw: Record<string, RawCharacter> = await res.json();
  const characters = Object.values(raw).sort((a, b) => Number(a.id) - Number(b.id));
  console.log(`Fetched ${characters.length} characters.`);

  if (FORCE) console.log("FORCE=1 — overwriting existing files");
  if (SYNC_ONLY) console.log(`SYNC_ONLY=${SYNC_ONLY}`);

  const tasks = characters.flatMap((c) => variantsToSync().map((v) => () => convertVariant(c, v)));
  await withConcurrency(tasks, CONCURRENCY);

  console.log("\n✓ Done. Run npm run upload to push new files to R2.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
