#!/usr/bin/env tsx
/**
 * Shared character-data helpers: fetch the StarRailRes index, map it to the
 * front-end shape, and compute the content hash. Also reads what is currently
 * live on the CDN so callers can detect what (if anything) has changed.
 *
 * Both generate-characters.ts (writes the files) and deploy.ts (gates on the
 * hash) build their character data through here so the hash stays consistent.
 */
import { createHash } from "crypto";

export const RAW_BASE = "https://raw.githubusercontent.com/Mar-7th/StarRailRes/master";

// Source language. Only character `name` is language-dependent; everything else
// (id, element/path enums, image URLs) is universal. Data is namespaced under
// data/<lang>/ on R2 so adding languages later is purely additive.
export const LANG = "en";
export const INDEX_URL = `${RAW_BASE}/index_min/${LANG}/characters.json`;

/** R2 custom domain that serves the assets (no trailing slash). */
export const ASSETS_CDN = "https://assets.hsr-randomizer.zelkonar.com";
/** File extension under each image variant folder ({id}.{ext}). */
export const ASSETS_EXT = "webp";

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

// Mirror the front end's strict Path/Element unions (src/types/{path,element}.ts).
// This data feeds those types directly at runtime, so a value outside these sets
// would render a broken icon for every user — fail generation instead of shipping
// it. When the game adds a path/element, add it here, to the *_MAP above if the
// source name differs, and to the front-end union.
const VALID_PATHS = new Set([
  "The Hunt",
  "Destruction",
  "Erudition",
  "Harmony",
  "Nihility",
  "Preservation",
  "Abundance",
  "Remembrance",
  "Elation",
]);
const VALID_ELEMENTS = new Set(["Fire", "Ice", "Lightning", "Wind", "Quantum", "Imaginary", "Physical"]);

export interface RawCharacter {
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

export interface Character {
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
  const mapped = PATH_MAP[raw] ?? raw;
  if (!VALID_PATHS.has(mapped)) {
    throw new Error(`Unknown path "${raw}" (resolved to "${mapped}"). Add it to PATH_MAP and the front-end Path type.`);
  }
  return mapped;
}

function mapElement(raw: string): string {
  const mapped = ELEMENT_MAP[raw] ?? raw;
  if (!VALID_ELEMENTS.has(mapped)) {
    throw new Error(`Unknown element "${raw}" (resolved to "${mapped}"). Add it to ELEMENT_MAP and the front-end Element type.`);
  }
  return mapped;
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

/** Fetch the raw StarRailRes index, sorted by numeric id. */
export async function fetchRawIndex(): Promise<RawCharacter[]> {
  const res = await fetch(INDEX_URL);
  if (!res.ok) throw new Error(`Failed to fetch index: ${res.status} ${res.statusText}`);
  const raw = (await res.json()) as Record<string, RawCharacter>;
  return Object.values(raw).sort((a, b) => Number(a.id) - Number(b.id));
}

export interface CharacterData {
  characters: Character[];
  /** Canonical JSON body — both the file contents and the hash input. */
  body: string;
  /** First 10 hex chars of the sha256 of `body`. */
  hash: string;
  /** Content-addressed file name, e.g. characters.<hash>.json. */
  file: string;
}

/** Map the raw index to the front-end shape and compute its content hash. */
export function buildCharacterData(raw: RawCharacter[]): CharacterData {
  const characters = raw.map(toCharacter);
  const body = JSON.stringify(characters);
  const hash = createHash("sha256").update(body).digest("hex").slice(0, 10);
  return { characters, body, hash, file: `characters.${hash}.json` };
}

export interface Deployed {
  hash: string;
  /** Character ids already live on the CDN. */
  ids: Set<number>;
}

/**
 * Read what is currently live on the CDN: the published hash and the set of
 * character ids in the deployed data file. Returns null before the first deploy
 * (no version.json yet), which callers treat as "everything is new".
 */
export async function fetchDeployed(): Promise<Deployed | null> {
  const verRes = await fetch(`${ASSETS_CDN}/data/${LANG}/version.json`, { cache: "no-store" });
  if (verRes.status === 404) return null;
  if (!verRes.ok) throw new Error(`Failed to fetch deployed version.json: ${verRes.status}`);

  const version = (await verRes.json()) as { hash: string; file: string };
  const dataRes = await fetch(`${ASSETS_CDN}/data/${LANG}/${version.file}`);
  if (!dataRes.ok) throw new Error(`Failed to fetch deployed ${version.file}: ${dataRes.status}`);

  const chars = (await dataRes.json()) as { id: number }[];
  return { hash: version.hash, ids: new Set(chars.map((c) => c.id)) };
}
