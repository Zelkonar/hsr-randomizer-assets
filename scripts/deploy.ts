#!/usr/bin/env tsx
/**
 * Full deploy: regenerate metadata, sync new images, and upload to R2 — but
 * only when something actually changed.
 *
 * The character content hash changes whenever the roster or its metadata
 * changes, and a new character is the only thing that adds images. So we
 * compute the current hash, compare it to what is live on the CDN, and exit
 * early when they match. This makes the daily GitHub Action a cheap no-op on
 * days with no new characters instead of re-downloading and re-compressing
 * every image. Use FORCE=1 to rebuild and re-upload everything regardless.
 *
 * Usage (from repo root):
 *   npm run deploy
 *   FORCE=1 npm run deploy
 */
import { fetchRawIndex, buildCharacterData, fetchDeployed } from "./data";
import { main as generate } from "./generate-characters";
import { main as sync } from "./sync";
import { main as upload } from "./upload";

const FORCE = process.env.FORCE === "1";

async function main() {
  const raw = await fetchRawIndex();
  const { hash } = buildCharacterData(raw);
  const deployed = await fetchDeployed();

  if (!FORCE && deployed && deployed.hash === hash) {
    console.log(`No changes (hash ${hash}). Nothing to deploy.`);
    return;
  }

  if (FORCE) console.log("FORCE=1 — rebuilding and re-uploading everything.");
  else if (!deployed) console.log("No live data found — first deploy.");
  else console.log(`Changes detected (${deployed.hash} → ${hash}). Deploying.`);

  await generate();
  await sync();
  await upload();

  console.log("\n✓ Deploy complete.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
