terraform {
  required_version = ">= 1.5.0"

  # Backend configuration
  # In CI/CD, this is configured via -backend-config flags
  # For local development, use backend.hcl file
  backend "s3" {
    # Configuration provided via -backend-config or environment variables
  }

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
    archive = {
      source  = "hashicorp/archive"
      version = "~> 2.4"
    }
  }
}

provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      Project     = var.project_name
      Environment = var.environment
      ManagedBy   = "Terraform"
      Service     = "analytics-service"
    }
  }
}
