#!/usr/bin/env bash
# Deploy newspapers-mcp to Google Cloud Functions (gen2) in the mcp-svcs project.
# Usage: ./deploy.sh
set -euo pipefail

ACCOUNT="raphink@gmail.com"
PROJECT="mcp-svcs"
REGION="europe-west1"
FUNCTION="newspapers-mcp"

# Build TypeScript
echo "Building TypeScript..."
npm run build

# Deploy
echo "Deploying $FUNCTION to $PROJECT ($REGION)..."
gcloud functions deploy "$FUNCTION" \
  --gen2 \
  --runtime=nodejs22 \
  --region="$REGION" \
  --project="$PROJECT" \
  --account="$ACCOUNT" \
  --source=. \
  --entry-point=newspapersMcp \
  --trigger-http \
  --allow-unauthenticated \
  --max-instances=1 \
  --set-env-vars="EUROPEANA_API_KEY=${EUROPEANA_API_KEY:-demo}"

echo "Done."
