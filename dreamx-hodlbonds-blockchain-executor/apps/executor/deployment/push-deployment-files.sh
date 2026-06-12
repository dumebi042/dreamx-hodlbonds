#!/bin/bash
set -e

# Upload deployment files to Google Cloud Storage
# Run this script whenever you update docker-compose files or init-deployment.sh
#
# What this uploads:
# - docker-compose.base.yml
# - docker-compose.stage.yml
# - docker-compose.main.yml
# - init-deployment.sh
# - ops-agent-config.yaml
#
# Prerequisites:
# - gcloud CLI installed and authenticated
# - GCS bucket created (see instructions below)
# - Service account has roles/storage.objectAdmin on the bucket

BUCKET_NAME="blockchain-executor-deployments"
PROJECT_ID="${GCP_PROJECT_ID:-$(gcloud config get-value project)}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo "=== Uploading Deployment Files to GCS ==="
echo "Bucket: gs://${BUCKET_NAME}"
echo "Project: ${PROJECT_ID}"
echo ""

# Check if gcloud is configured
if ! gcloud config get-value project &>/dev/null; then
    echo -e "${RED}Error: gcloud is not configured. Please run 'gcloud init' first.${NC}"
    exit 1
fi

# Check if bucket exists, if not provide instructions
if ! gsutil ls "gs://${BUCKET_NAME}" &>/dev/null; then
    echo -e "${RED}Error: Bucket gs://${BUCKET_NAME} does not exist.${NC}"
    echo ""
    echo "To create the bucket, run:"
    echo ""
    echo -e "${YELLOW}  gsutil mb -p ${PROJECT_ID} -l us-central1 gs://${BUCKET_NAME}${NC}"
    echo ""
    echo "To grant the service account access, run:"
    echo ""
    echo -e "${YELLOW}  gsutil iam ch serviceAccount:SERVICE_ACCOUNT_EMAIL:roles/storage.objectViewer gs://${BUCKET_NAME}${NC}"
    echo ""
    echo "Replace SERVICE_ACCOUNT_EMAIL with your GCE service account email."
    echo ""
    exit 1
fi

# Files to upload
FILES=(
    "docker-compose.base.yml"
    "docker-compose.stage.yml"
    "docker-compose.main.yml"
    "init-deployment.sh"
    "ops-agent-config.yaml"
)

# Upload each file
echo "Uploading files..."
for file in "${FILES[@]}"; do
    if [[ -f "${SCRIPT_DIR}/${file}" ]]; then
        echo -n "  Uploading ${file}... "
        if gsutil cp "${SCRIPT_DIR}/${file}" "gs://${BUCKET_NAME}/${file}" 2>/dev/null; then
            echo -e "${GREEN}✓${NC}"
        else
            echo -e "${RED}✗ Failed${NC}"
            exit 1
        fi
    else
        echo -e "${RED}✗ File not found: ${file}${NC}"
        exit 1
    fi
done

echo ""
echo -e "${GREEN}=== Upload Complete ===${NC}"
echo ""
echo "Files are now available at:"
echo "  gs://${BUCKET_NAME}/"
echo ""
echo "To view uploaded files:"
echo "  gsutil ls gs://${BUCKET_NAME}/"
echo ""
echo "To download on GCE instances, the init-deployment.sh script will use:"
echo "  gsutil cp gs://${BUCKET_NAME}/docker-compose.* ."
echo "  gsutil cp gs://${BUCKET_NAME}/init-deployment.sh ."
