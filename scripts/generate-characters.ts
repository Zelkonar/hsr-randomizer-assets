#!/usr/bin/env tsx
/**
 * Generate character metadata JSON for the front end and write it into the
 * upload tree (assets/data/).
 *
 * Produces two files:
 *   assets/data/characters.<hash>.json  — the character array (immutable; new
 *                                          hash on every content change)
 *   assets/data/version.json            — { hash, file, count, generatedAt }
 *                                          (the always-overwritten pointer)
 *
 * Usage (from repo root):
 *   npm run generate
 *
 * Run `npm run upload` afterwards to push to R2 (or `npm run deploy` for the
 * full sync + generate + upload flow).
 */
import { createHash } from "crypto";
import { writeFileSync, mkdirSync } from "fs";
import { resolve } from "path";

// Source language. Only character `name` is language-dependent; everything else
// (id, element/path enums, image URLs) is universal. Data is namespaced under
// data/<lang>/ on R2 so adding languages later is purely additive — make this a
// loop over languages when that day comes.
const LANG = "en";
const INDEX_URL = `https://raw.githubusercontent.com/Mar-7th/StarRailRes/master/index_min/${LANG}/characters.json`;

/** R2 custom domain that serves the assets (no trailing slash). */
const ASSETS_CDN = "https://assets.hsr-randomizer.zelkonar.com";
/** File extension under each image variant folder ({id}.{ext}). */
const ASSETS_EXT = "webp";

const OUT_DIR = resolve(process.cwd(), "assets", "data", LANG);

const PATH_MAP: Record<string, string> = {
  Knight: "Preservation",
  Rogue: "The Hunt",
  Mage: "Erudition",
  Shaman: "Harmony",
  Warlock: "Nihility",
  Warrior: "Destruction",
  Priest: "Abundance",
  Memory: "Remembrance",
  Elation: "Elation",
};

const ELEMENT_MAP: Record<string, string> = {
  Thunder: "Lightning",
};

interface RawCharacter {
  id: string;
  name: string;
  tag: string;
  rarity: number;
  path: string;
  element: string;
  icon: string;
  preview: string;
  portrait: string;
}

interface Character {
  id: number;
  name: string;
  element: string;
  path: string;
  rarity: number;
  icon: string;
  preview: string;
  portrait: string;
}

function mapPath(raw: string): string {
  const mapped = PATH_MAP[raw];
  if (!mapped) {
    console.warn(`  ⚠  Unknown path "${raw}" - writing as-is. Add it to PATH_MAP.`);
    return raw;
  }
  return mapped;
}

function mapElement(raw: string): string {
  return ELEMENT_MAP[raw] ?? raw;
}

function toCharacter(c: RawCharacter): Character {
  const id = Number(c.id);
  return {
    id,
    name: id >= 8000 ? "Trailblazer" : c.name,
    element: mapElement(c.element),
    path: mapPath(c.path),
    rarity: c.rarity,
    icon: `${ASSETS_CDN}/characters/icon/${c.id}.${ASSETS_EXT}`,
    preview: `${ASSETS_CDN}/characters/preview/${c.id}.${ASSETS_EXT}`,
    portrait: `${ASSETS_CDN}/characters/portrait/${c.id}.${ASSETS_EXT}`,
  };
}

async function main() {
  console.log("Fetching character index from Mar-7th/StarRailRes...");
  const res = await fetch(INDEX_URL);
  if (!res.ok) throw new Error(`Failed to fetch: ${res.status} ${res.statusText}`);

  const raw = (await res.json()) as Record<string, RawCharacter>;
  const characters = Object.values(raw)
    .sort((a, b) => Number(a.id) - Number(b.id))
    .map(toCharacter);

  console.log(`  Found ${characters.length} characters.`);

  // Canonical JSON for both the file body and the content hash.
  const body = JSON.stringify(characters);
  const hash = createHash("sha256").update(body).digest("hex").slice(0, 10);
  const file = `characters.${hash}.json`;

  const version = {
    hash,
    file,
    count: characters.length,
    generatedAt: new Date().toISOString(),
  };

  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(resolve(OUT_DIR, file), body, "utf-8");
  writeFileSync(resolve(OUT_DIR, "version.json"), JSON.stringify(version, null, 2), "utf-8");

  console.log(`  ✓ data/${LANG}/${file}`);
  console.log(`  ✓ data/${LANG}/version.json (hash ${hash})`);
  console.log("\n✓ Done. Run npm run upload to push to R2.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
