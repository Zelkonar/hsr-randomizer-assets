variable "cloudflare_api_token" {
  description = "Cloudflare API token with R2:Edit permission"
  sensitive   = true
}

variable "cloudflare_account_id" {
  description = "Cloudflare account ID"
  default     = "668ecbb1536f431b765200f8b2f9fa97"
}
