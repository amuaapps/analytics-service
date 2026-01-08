#!/bin/bash
set -e

# Analytics Service Azure Deployment Script
# Usage: ./deploy.sh <environment> <resource-group>

ENVIRONMENT=${1:-dev}
RESOURCE_GROUP=${2:-analytics-service-${ENVIRONMENT}-rg}
LOCATION=${3:-eastus}
PARAMETERS_FILE="parameters.${ENVIRONMENT}.json"

echo "=========================================="
echo "Analytics Service Azure Deployment"
echo "=========================================="
echo "Environment: $ENVIRONMENT"
echo "Resource Group: $RESOURCE_GROUP"
echo "Location: $LOCATION"
echo "Parameters: $PARAMETERS_FILE"
echo "=========================================="

# Check if parameters file exists
if [ ! -f "$PARAMETERS_FILE" ]; then
  echo "Error: Parameters file $PARAMETERS_FILE not found"
  echo "Please create it from parameters.dev.json.example"
  exit 1
fi

# Create resource group if it doesn't exist
echo "Creating resource group..."
az group create \
  --name "$RESOURCE_GROUP" \
  --location "$LOCATION"

# Validate template
echo "Validating Bicep template..."
az deployment group validate \
  --resource-group "$RESOURCE_GROUP" \
  --template-file main.bicep \
  --parameters "@$PARAMETERS_FILE"

# Deploy
echo "Deploying infrastructure..."
DEPLOYMENT_NAME="analytics-deployment-$(date +%Y%m%d-%H%M%S)"

az deployment group create \
  --resource-group "$RESOURCE_GROUP" \
  --template-file main.bicep \
  --parameters "@$PARAMETERS_FILE" \
  --name "$DEPLOYMENT_NAME" \
  --verbose

# Get outputs
echo "=========================================="
echo "Deployment complete!"
echo "=========================================="
echo "Getting deployment outputs..."

az deployment group show \
  --resource-group "$RESOURCE_GROUP" \
  --name "$DEPLOYMENT_NAME" \
  --query properties.outputs

echo "=========================================="
echo "Deployment Summary:"
echo "  Resource Group: $RESOURCE_GROUP"
echo "  Deployment Name: $DEPLOYMENT_NAME"
echo "  Environment: $ENVIRONMENT"
echo "=========================================="
