terraform {
  required_providers {
    cloudflare = {
      source  = "registry.terraform.io/cloudflare/cloudflare"
      version = "~> 5.0"
    }
  }
}

provider "cloudflare" {
  api_token = var.cloudflare_api_token
}

resource "cloudflare_r2_bucket" "assets" {
  account_id = var.cloudflare_account_id
  name       = "hsr-randomizer-assets"
  location   = "WNAM"

  # The bucket predates Terraform and holds all live assets; never let a plan
  # destroy/recreate it (re-import instead — see README). Guards accidental
  # `tofu destroy` and force-replacement.
  lifecycle {
    prevent_destroy = true
  }
}

# The front end fetch()es data/version.json and the hashed character JSON
# cross-origin (app domain -> assets.hsr-randomizer.zelkonar.com). fetch
# requires CORS, unlike <img>. The assets are public and read-only, so allow
# GET/HEAD from any origin (covers prod + Vercel preview deploys).
resource "cloudflare_r2_bucket_cors" "assets" {
  account_id  = var.cloudflare_account_id
  bucket_name = cloudflare_r2_bucket.assets.name
  rules = [{
    allowed = {
      methods = ["GET", "HEAD"]
      origins = ["*"]
    }
    expose_headers  = ["ETag"]
    max_age_seconds = 3600
  }]
}
