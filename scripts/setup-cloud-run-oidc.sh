#!/usr/bin/env bash
# One-time, keyless GitHub Actions -> Google Cloud Run authorization for spider-paint.
# Run as a GCP project IAM admin with gcloud and an authenticated gh CLI.
set -euo pipefail

REPO="Pengeszikra/spider-paint"
SERVICE="spider-paint"
REGION="europe-west1"
POOL="spider-paint-github"
PROVIDER="main"
DEPLOY_ACCOUNT="spider-paint-deploy"

command -v gcloud >/dev/null || { echo "Install and log in to the Google Cloud CLI first." >&2; exit 1; }
command -v gh >/dev/null || { echo "Install and log in to the GitHub CLI (gh) first." >&2; exit 1; }
gh auth status >/dev/null
if [[ $# -gt 0 ]]; then
  PROJECT_ID="$1"
else
  PROJECT_ID="$(gcloud config get-value project 2>/dev/null)"
fi
if [[ -z "$PROJECT_ID" || "$PROJECT_ID" == "(unset)" ]]; then
  echo "Pass your Google Cloud project ID as argument: bash scripts/setup-cloud-run-oidc.sh PROJECT_ID" >&2
  exit 1
fi
echo "Configuring keyless GitHub -> Cloud Run deploy for $REPO in GCP project $PROJECT_ID"
gcloud run services describe "$SERVICE" --project "$PROJECT_ID" --region "$REGION" --format='value(metadata.name)' >/dev/null
PROJECT_NUMBER="$(gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)')"
[[ -n "$PROJECT_NUMBER" ]] || { echo "Cannot discover project number" >&2; exit 1; }
DEPLOY_SA="$DEPLOY_ACCOUNT@$PROJECT_ID.iam.gserviceaccount.com"
RUNTIME_SA="$(gcloud run services describe "$SERVICE" --project "$PROJECT_ID" --region "$REGION" --format='value(spec.template.spec.serviceAccountName)')"
if [[ -z "$RUNTIME_SA" ]]; then RUNTIME_SA="$PROJECT_NUMBER-compute@developer.gserviceaccount.com"; fi

# These APIs are needed for source-based Cloud Run deployments and token exchange.
gcloud services enable iamcredentials.googleapis.com sts.googleapis.com iam.googleapis.com \
  run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com \
  --project "$PROJECT_ID"

if ! gcloud iam service-accounts describe "$DEPLOY_SA" --project "$PROJECT_ID" >/dev/null 2>&1; then
  gcloud iam service-accounts create "$DEPLOY_ACCOUNT" --project "$PROJECT_ID" \
    --display-name "spider-paint GitHub Actions Cloud Run deployer"
fi
if ! gcloud iam workload-identity-pools describe "$POOL" --project "$PROJECT_ID" --location global >/dev/null 2>&1; then
  gcloud iam workload-identity-pools create "$POOL" --project "$PROJECT_ID" --location global \
    --display-name "spider-paint GitHub Actions"
fi

# Only tokens issued to this repository's main branch may authenticate.
CONDITION="assertion.repository == 'Pengeszikra/spider-paint' && assertion.ref == 'refs/heads/main'"
if ! gcloud iam workload-identity-pools providers describe "$PROVIDER" --project "$PROJECT_ID" \
  --location global --workload-identity-pool "$POOL" >/dev/null 2>&1; then
  gcloud iam workload-identity-pools providers create-oidc "$PROVIDER" \
    --project "$PROJECT_ID" --location global --workload-identity-pool "$POOL" \
    --display-name "spider-paint main branch" \
    --issuer-uri "https://token.actions.githubusercontent.com" \
    --attribute-mapping "google.subject=assertion.sub,attribute.repository=assertion.repository" \
    --attribute-condition "$CONDITION"
else
  FOUND_CONDITION="$(gcloud iam workload-identity-pools providers describe "$PROVIDER" \
    --project "$PROJECT_ID" --location global --workload-identity-pool "$POOL" \
    --format='value(attributeCondition)')"
  if [[ "$FOUND_CONDITION" != "$CONDITION" ]]; then
    echo "Existing identity provider has a different condition; refusing to broaden its trust policy." >&2
    exit 1
  fi
fi

POOL_RESOURCE="projects/$PROJECT_NUMBER/locations/global/workloadIdentityPools/$POOL"
PRINCIPAL="principalSet://iam.googleapis.com/$POOL_RESOURCE/attribute.repository/$REPO"
gcloud iam service-accounts add-iam-policy-binding "$DEPLOY_SA" \
  --project "$PROJECT_ID" --role roles/iam.workloadIdentityUser \
  --member "$PRINCIPAL" --quiet >/dev/null

# Least-privilege roles needed for Cloud Run source deploy.
for ROLE in roles/run.sourceDeveloper roles/serviceusage.serviceUsageConsumer; do
  gcloud projects add-iam-policy-binding "$PROJECT_ID" --member "serviceAccount:$DEPLOY_SA" \
    --role "$ROLE" --condition=None --quiet >/dev/null
done
gcloud iam service-accounts add-iam-policy-binding "$RUNTIME_SA" --project "$PROJECT_ID" \
  --member "serviceAccount:$DEPLOY_SA" --role roles/iam.serviceAccountUser \
  --quiet >/dev/null

# Cloud Build's default compute service account must be able to build for Cloud Run.
BUILDER_SA="$PROJECT_NUMBER-compute@developer.gserviceaccount.com"
gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member "serviceAccount:$BUILDER_SA" --role roles/run.builder \
  --condition=None --quiet >/dev/null

PROVIDER_RESOURCE="$(gcloud iam workload-identity-pools providers describe "$PROVIDER" \
  --project "$PROJECT_ID" --location global --workload-identity-pool "$POOL" \
  --format='value(name)')"
[[ -n "$PROVIDER_RESOURCE" ]] || { echo "Could not read provider resource" >&2; exit 1; }

gh variable set GCP_PROJECT_ID --repo "$REPO" --body "$PROJECT_ID"
gh variable set GCP_WIF_PROVIDER --repo "$REPO" --body "$PROVIDER_RESOURCE"
gh variable set GCP_DEPLOY_SA --repo "$REPO" --body "$DEPLOY_SA"

echo
echo "Keyless Cloud Run deploy is configured for $REPO:"
echo "  project: $PROJECT_ID"
echo "  provider: $PROVIDER_RESOURCE"
echo "  service account: $DEPLOY_SA"
echo "  runtime service account: $RUNTIME_SA"
echo "GitHub Actions -> Deploy spider-paint to Cloud Run will deploy after successful main CI."
echo "Trigger a manual workflow run once to verify live /api/version, or push another commit."
