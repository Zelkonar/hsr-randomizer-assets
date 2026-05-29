# hsr-randomizer-infra

Infrastructure and asset/data pipeline for [hsr-randomizer](https://github.com/Zelkonar/hsr-randomizer).

This repo owns two things:

1. **Cloudflare infrastructure** (OpenTofu/Terraform) — the R2 bucket that backs `assets.hsr-randomizer.zelkonar.com` and its CORS config.
2. **The asset + character-data pipeline** (Node scripts) — fetches images and character metadata from [Mar-7th/StarRailRes](https://github.com/Mar-7th/StarRailRes), optimizes them, and uploads to R2.

The front end fetches character data from R2 **at runtime**, so a data update (new patch ~every 6 weeks) lands by running the pipeline here — no front-end redeploy required.

## Prerequisites

- **Node.js 20.19+**
- **[OpenTofu](https://opentofu.org/)** (or Terraform) for the infrastructure
- **R2 credentials** (an R2 API token with S3 access keys)
- A Cloudflare **API token** with `R2:Edit` for the infra (`var.cloudflare_api_token`)

```bash
npm install
```

## Asset & data pipeline

| Script               | What it does                                                                                       |
| -------------------- | -------------------------------------------------------------------------------------------------- |
| `npm run sync`       | Downloads character images from StarRailRes, converts to optimized `.webp` into `assets/characters/` ([scripts/sync.ts](scripts/sync.ts)) |
| `npm run generate`   | Builds character metadata into `assets/data/en/characters.<hash>.json` + `version.json` ([scripts/generate-characters.ts](scripts/generate-characters.ts)) |
| `npm run upload`     | Uploads `assets/` to R2 ([scripts/upload.ts](scripts/upload.ts))                                   |
| `npm run deploy`     | `sync` → `generate` → `upload` (the full refresh)                                                  |

The upload scripts need R2 S3 credentials in the environment:

```bash
export R2_ACCESS_KEY_ID="..."
export R2_SECRET_ACCESS_KEY="..."
npm run deploy
```

Useful flags:

- `FORCE=1 npm run sync` — re-download/re-convert images even if they already exist locally.
- `FORCE=1 npm run upload` — re-upload everything instead of skipping keys already in the bucket.
- `SYNC_ONLY=portrait npm run sync` — limit image sync to one variant (`icon` | `preview` | `portrait`).

### R2 layout & caching

Everything under `assets/` maps to the bucket root, served via `https://assets.hsr-randomizer.zelkonar.com`:

```
characters/icon/{id}.webp        immutable (content is fixed per id)
characters/preview/{id}.webp     immutable
characters/portrait/{id}.webp    immutable
data/en/characters.<hash>.json   immutable (filename changes when content changes)
data/en/version.json             no-cache  (the pointer; always revalidated)
```

Character data uses **content-addressing**: `generate` hashes the JSON and writes `characters.<hash>.json`, plus a tiny `version.json` pointing at it. `upload.ts` sends the hashed file (and all images) with `Cache-Control: public, max-age=31536000, immutable` and skips keys already present; `version.json` is the one object always re-uploaded, with `Cache-Control: no-cache`. The front end revalidates `version.json` and only fetches the data file when the hash changes.

Data is namespaced under `data/<lang>/` (currently just `en`) so additional languages are purely additive later — only character names are language-dependent.

## Infrastructure (OpenTofu)

[main.tf](main.tf) manages:

- `cloudflare_r2_bucket.assets` — the `hsr-randomizer-assets` bucket.
- `cloudflare_r2_bucket_cors.assets` — allows cross-origin `GET`/`HEAD` from any origin so the app's `fetch()` of the JSON works (the data is public and read-only).

State is stored remotely in a **private** R2 bucket via the S3-compatible backend ([backend.tf](backend.tf)).

### Credentials

```bash
# Cloudflare API token for the provider (R2:Edit)
export TF_VAR_cloudflare_api_token="..."

# R2 S3 keys for the state backend
export AWS_ACCESS_KEY_ID="$R2_ACCESS_KEY_ID"
export AWS_SECRET_ACCESS_KEY="$R2_SECRET_ACCESS_KEY"
```

`cloudflare_account_id` is defaulted in [variables.tf](variables.tf). Copy [terraform.tfvars.example](terraform.tfvars.example) to `terraform.tfvars` if you prefer a file over env vars (never commit it).

### First-time state backend setup

The state bucket must exist before `init`. **Do not reuse the public assets bucket** — state can contain secrets.

```bash
wrangler r2 bucket create hsr-randomizer-tfstate   # private; one-time
tofu init -migrate-state                           # migrates any local state up
```

### Usage

```bash
tofu plan
tofu apply
```

Note: the existing R2 bucket predates Terraform management. If state is ever lost, re-import it rather than letting `apply` try to recreate it:

```bash
tofu import cloudflare_r2_bucket.assets '<account_id>/hsr-randomizer-assets/default'
```

(`cloudflare_r2_bucket_cors` does not support import; it's recreated normally.)
