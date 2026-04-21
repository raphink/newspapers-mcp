#!/usr/bin/env bash
# Deploy newspapers-mcp to Google Cloud Functions (gen2) in the mcp-svcs project.
# Usage: ./deploy.sh
set -euo pipefail

ACCOUNT="${GCLOUD_ACCOUNT:-$(gcloud config get-value account 2>/dev/null)}"
PROJECT="mcp-svcs"
REGION="europe-west1"
FUNCTION="newspapers-mcp"

# Ensure the secret exists in Secret Manager
echo "Ensuring EUROPEANA_API_KEY secret exists..."
if ! gcloud secrets describe EUROPEANA_API_KEY --account "$ACCOUNT" --project="$PROJECT" &>/dev/null; then
  echo "Creating EUROPEANA_API_KEY secret..."
  echo -n "${EUROPEANA_API_KEY:-api2demo}" | \
    gcloud secrets create EUROPEANA_API_KEY \
      --project="$PROJECT" \
      --account="$ACCOUNT" \
      --replication-policy="automatic" \
      --data-file=-
fi

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
  --set-secrets="EUROPEANA_API_KEY=EUROPEANA_API_KEY:latest"

echo "Done."
