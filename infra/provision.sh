#!/bin/bash
# BizRoom.ai Azure Resource Provisioning Script
# Run this script to provision all required Azure resources

set -e

RESOURCE_GROUP="rg-bizroom"
LOCATION="koreacentral"
OPENAI_LOCATION="eastus2"
APP_NAME="bizroom"

echo "=== BizRoom.ai Azure Provisioning ==="

# Resource Group
echo "Creating resource group..."
az group create --name $RESOURCE_GROUP --location $LOCATION

# Azure OpenAI (GPT-4o)
echo "Creating Azure OpenAI service..."
az cognitiveservices account create \
  --name ${APP_NAME}-openai \
  --resource-group $RESOURCE_GROUP \
  --kind OpenAI \
  --sku S0 \
  --location $OPENAI_LOCATION

# Deploy GPT-4o model
echo "Deploying GPT-4o model..."
az cognitiveservices account deployment create \
  --name ${APP_NAME}-openai \
  --resource-group $RESOURCE_GROUP \
  --deployment-name gpt-4o \
  --model-name gpt-4o \
  --model-version "2024-08-06" \
  --model-format OpenAI \
  --sku-capacity 30 \
  --sku-name Standard

# Azure SignalR Service (Serverless mode)
echo "Creating Azure SignalR service..."
az signalr create \
  --name ${APP_NAME}-signalr \
  --resource-group $RESOURCE_GROUP \
  --sku Free_F1 \
  --service-mode Serverless \
  --location $LOCATION

# Azure Static Web Apps
echo "Creating Azure Static Web App..."
az staticwebapp create \
  --name ${APP_NAME}-app \
  --resource-group $RESOURCE_GROUP \
  --source https://github.com/DHxWhy/BizRoom \
  --branch main \
  --app-location "/frontend" \
  --api-location "/backend" \
  --output-location "dist"

echo ""
echo "=== Provisioning Complete ==="
echo ""
echo "Next steps:"
echo "1. Get OpenAI endpoint: az cognitiveservices account show --name ${APP_NAME}-openai --resource-group $RESOURCE_GROUP --query properties.endpoint -o tsv"
echo "2. Get OpenAI key: az cognitiveservices account keys list --name ${APP_NAME}-openai --resource-group $RESOURCE_GROUP --query key1 -o tsv"
echo "3. Get SignalR connection: az signalr key list --name ${APP_NAME}-signalr --resource-group $RESOURCE_GROUP --query primaryConnectionString -o tsv"
echo "4. Configure app settings in Azure Static Web Apps portal"
