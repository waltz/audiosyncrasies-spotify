output "spotify_secret_arn" {
  description = "ARN of the Spotify credentials secret in Secrets Manager"
  value       = aws_secretsmanager_secret.spotify_credentials.arn
}

output "lambda_function_arn" {
  description = "ARN of the Lambda function"
  value       = aws_lambda_function.audiosyncrasies.arn
}

output "lambda_function_name" {
  description = "Name of the Lambda function"
  value       = aws_lambda_function.audiosyncrasies.function_name
}

output "log_group_name" {
  description = "CloudWatch log group name"
  value       = aws_cloudwatch_log_group.lambda_logs.name
}

output "eventbridge_rule_arn" {
  description = "ARN of the EventBridge schedule rule"
  value       = aws_cloudwatch_event_rule.nightly_2am.arn
}
