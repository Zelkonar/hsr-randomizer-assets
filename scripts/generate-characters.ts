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
import { writeFileSync, mkdirSync } from "fs";
import { resolve } from "path";
import { fileURLToPath } from "url";
import { LANG, fetchRawIndex, buildCharacterData } from "./data";

const OUT_DIR = resolve(process.cwd(), "assets", "data", LANG);

export async function main() {
  console.log("Fetching character index from Mar-7th/StarRailRes...");
  const raw = await fetchRawIndex();
  console.log(`  Found ${raw.length} characters.`);

  const { body, hash, file, characters } = buildCharacterData(raw);

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
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
