#!/usr/bin/env bash
# Deploy newspapers-mcp to Google Cloud Functions (gen2) in the mcp-svcs project.
# Usage: ./deploy.sh
set -euo pipefail

ACCOUNT="${GCLOUD_ACCOUNT:-$(gcloud config get-value account 2>/dev/null)}"
PROJECT="mcp-svcs"
REGION="europe-west1"
FUNCTION="newspapers-mcp"

# Ensure secrets exist in Secret Manager
for secret_name in EUROPEANA_API_KEY TROVE_API_KEY; do
  echo "Ensuring $secret_name secret exists..."
  if ! gcloud secrets describe "$secret_name" --account "$ACCOUNT" --project="$PROJECT" &>/dev/null; then
    default_val=""
    [[ "$secret_name" == "EUROPEANA_API_KEY" ]] && default_val="api2demo"
    val="${!secret_name:-$default_val}"
    if [[ -n "$val" ]]; then
      echo "Creating $secret_name secret..."
      echo -n "$val" | \
        gcloud secrets create "$secret_name" \
          --project="$PROJECT" \
          --account="$ACCOUNT" \
          --replication-policy="automatic" \
          --data-file=-
    else
      echo "Skipping $secret_name (no value provided)"
    fi
  fi
done

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
  --set-secrets="EUROPEANA_API_KEY=EUROPEANA_API_KEY:latest,TROVE_API_KEY=TROVE_API_KEY:latest"

echo "Done."
