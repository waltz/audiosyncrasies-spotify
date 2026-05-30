variable "aws_region" {
  description = "AWS region to deploy into"
  type        = string
  default     = "us-east-1"
}

variable "function_name" {
  description = "Name for the Lambda function and related resources"
  type        = string
  default     = "audiosyncrasies-spotify-sync"
}

variable "lambda_zip_path" {
  description = "Path to the zipped Lambda deployment package"
  type        = string
  default     = "../lambda.zip"
}

variable "playlist_id" {
  description = "Spotify playlist ID to sync tracks into"
  type        = string
  default     = "5MpC0JxMZJ7bIJPwPFCtNv"
}

# These are only used to seed the Secrets Manager secret on first apply.
# After that, the Lambda reads credentials directly from Secrets Manager at runtime.

variable "spotify_client_id" {
  description = "Spotify app client ID"
  type        = string
  sensitive   = true
}

variable "spotify_client_secret" {
  description = "Spotify app client secret"
  type        = string
  sensitive   = true
}

variable "spotify_refresh_token" {
  description = "Spotify OAuth refresh token (obtained once via browser auth)"
  type        = string
  sensitive   = true
}
