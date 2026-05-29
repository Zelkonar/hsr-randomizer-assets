# Remote state on Cloudflare R2 (S3-compatible) so state isn't machine-local.
#
# Prerequisites before `tofu init`:
#   1. Create the (private!) state bucket once — do NOT reuse the public assets
#      bucket: `wrangler r2 bucket create hsr-randomizer-tfstate`
#   2. Export R2 S3 credentials the backend reads from the environment:
#        export AWS_ACCESS_KEY_ID=<r2 access key id>
#        export AWS_SECRET_ACCESS_KEY=<r2 secret access key>
#   3. Migrate existing local state up: `tofu init -migrate-state`
#
# Backend blocks cannot use variables, so the account ID/bucket are literals.
terraform {
  backend "s3" {
    bucket = "hsr-randomizer-tfstate"
    key    = "hsr-randomizer-infra.tfstate"
    region = "auto"

    endpoints = {
      s3 = "https://668ecbb1536f431b765200f8b2f9fa97.r2.cloudflarestorage.com"
    }

    # R2 is S3-compatible but not AWS — disable the AWS-only behaviors.
    skip_credentials_validation = true
    skip_region_validation      = true
    skip_requesting_account_id  = true
    skip_metadata_api_check     = true
    skip_s3_checksum            = true # R2 rejects AWS's default request checksums

    use_path_style = true

    # S3-native lock object instead of DynamoDB (OpenTofu >= 1.10).
    use_lockfile = true
  }
}
