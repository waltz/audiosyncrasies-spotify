terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

provider "aws" {
  region = var.aws_region
}

# -------------------------------------------------------------------
# CloudWatch Log Group
# -------------------------------------------------------------------

resource "aws_cloudwatch_log_group" "lambda_logs" {
  name              = "/aws/lambda/${var.function_name}"
  retention_in_days = 30
}

# -------------------------------------------------------------------
# Secrets Manager
# -------------------------------------------------------------------

resource "aws_secretsmanager_secret" "spotify_credentials" {
  name                    = "${var.function_name}/spotify-credentials"
  description             = "Spotify API credentials for audiosyncrasies sync"
  recovery_window_in_days = 0 # allow immediate deletion with terraform destroy
}

resource "aws_secretsmanager_secret_version" "spotify_credentials" {
  secret_id = aws_secretsmanager_secret.spotify_credentials.id
  secret_string = jsonencode({
    client_id     = var.spotify_client_id
    client_secret = var.spotify_client_secret
    refresh_token = var.spotify_refresh_token
  })
}

# -------------------------------------------------------------------
# IAM Role for Lambda
# -------------------------------------------------------------------

resource "aws_iam_role" "lambda_exec" {
  name = "${var.function_name}-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action    = "sts:AssumeRole"
      Effect    = "Allow"
      Principal = { Service = "lambda.amazonaws.com" }
    }]
  })
}

resource "aws_iam_role_policy_attachment" "lambda_basic_execution" {
  role       = aws_iam_role.lambda_exec.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

resource "aws_iam_role_policy" "lambda_secrets_access" {
  name = "${var.function_name}-secrets-access"
  role = aws_iam_role.lambda_exec.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = "secretsmanager:GetSecretValue"
      Resource = aws_secretsmanager_secret.spotify_credentials.arn
    }]
  })
}

# -------------------------------------------------------------------
# Lambda Function
# -------------------------------------------------------------------

resource "aws_lambda_function" "audiosyncrasies" {
  function_name = var.function_name
  role          = aws_iam_role.lambda_exec.arn
  filename      = var.lambda_zip_path
  handler       = "index.handler"
  runtime       = "nodejs22.x"
  timeout       = 300 # 5 minutes — Spotify rate limiting may slow things down

  source_code_hash = filebase64sha256(var.lambda_zip_path)

  environment {
    variables = {
      SPOTIFY_SECRET_ARN = aws_secretsmanager_secret.spotify_credentials.arn
      PLAYLIST_ID        = var.playlist_id
    }
  }

  depends_on = [aws_cloudwatch_log_group.lambda_logs]
}

# -------------------------------------------------------------------
# EventBridge (CloudWatch Events) — 2am UTC nightly
# -------------------------------------------------------------------

resource "aws_cloudwatch_event_rule" "nightly_2am" {
  name                = "${var.function_name}-nightly"
  description         = "Trigger audiosyncrasies sync at 2am UTC every night"
  schedule_expression = "cron(0 2 * * ? *)"
}

resource "aws_cloudwatch_event_target" "lambda_target" {
  rule      = aws_cloudwatch_event_rule.nightly_2am.name
  target_id = "audiosyncrasies-lambda"
  arn       = aws_lambda_function.audiosyncrasies.arn
}

resource "aws_lambda_permission" "allow_eventbridge" {
  statement_id  = "AllowEventBridgeInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.audiosyncrasies.function_name
  principal     = "events.amazonaws.com"
  source_arn    = aws_cloudwatch_event_rule.nightly_2am.arn
}
