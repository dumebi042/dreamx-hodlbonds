#!/bin/bash
set -e

# Initialize deployment environment on GCE instances
# Run this on your GCE instance before starting Docker containers
#
# IMPORTANT: Run this script with sudo to avoid permission issues with OS Login:
#   sudo -E bash init-deployment.sh
#
# The -E flag preserves environment variables from your user session,
# allowing gcloud commands to authenticate as the instance service account.
#
# Required environment variables (or existing .env file):
#   DEPLOYMENT_REGION  - 'us1' or 'eu1'
#   CLOUD_SQL_INSTANCE - Cloud SQL connection string
#   GCP_PROJECT_ID     - GCP project ID
#
# What this does:
# - Downloads deployment files (docker-compose.yml files) from Cloud Storage
# - Fetches blockchain configs from Parameter Manager (region-specific)
# - Saves them to local files for Docker volume mounts
# - Sets ownership to UID 1001 (executor user in Docker containers)
#
# What this does NOT do:
# - Database credentials (Cloud SQL Proxy handles that via service account!)

# Load existing .env file if it exists (for subsequent runs)
if [[ -f .env ]]; then
    echo "Loading environment variables from existing .env file..."
    set -a
    source .env
    set +a
fi

# Configuration
PROJECT_ID="${GCP_PROJECT_ID:-$(gcloud config get-value project)}"
BUCKET_NAME="blockchain-executor-deployments"
CONFIG_DIR="./configs"

# Validate required environment variables
if [[ -z "${DEPLOYMENT_REGION}" ]]; then
    echo "Error: DEPLOYMENT_REGION must be set to 'us1' or 'eu1'"
    exit 1
fi

if [[ -z "${CLOUD_SQL_INSTANCE}" ]]; then
    echo "Error: CLOUD_SQL_INSTANCE must be set"
    exit 1
fi

if [[ -z "${GCP_PROJECT_ID}" ]]; then
    echo "Error: GCP_PROJECT_ID must be set"
    exit 1
fi

echo "=== Initializing Deployment Environment ==="
echo "Project: ${PROJECT_ID}"
echo "Region:  ${DEPLOYMENT_REGION}"
echo ""

# Check if gcloud is configured
if ! gcloud config get-value project &>/dev/null; then
    echo "Error: gcloud is not configured. Please run 'gcloud init' first."
    exit 1
fi

# Create directories
mkdir -p "${CONFIG_DIR}"

# Step 1: Download deployment files from Cloud Storage
echo "Step 1: Downloading deployment files from Cloud Storage..."
DEPLOYMENT_FILES=(
    "docker-compose.base.yml"
    "docker-compose.stage.yml"
    "docker-compose.main.yml"
    "ops-agent-config.yaml"
)

for file in "${DEPLOYMENT_FILES[@]}"; do
    echo -n "  Downloading ${file}... "
    if gsutil cp "gs://${BUCKET_NAME}/${file}" "./${file}" 2>/dev/null; then
        echo "✓"
    else
        echo "✗ Failed"
        echo "Error: Could not download ${file} from gs://${BUCKET_NAME}/"
        exit 1
    fi
done
echo ""

# Step 1.5: Install Ops Agent configuration
echo "Step 1.5: Installing Ops Agent configuration..."
OPS_AGENT_CONFIG_DIR="/etc/google-cloud-ops-agent"
OPS_AGENT_NEEDS_RESTART=false

if [[ -f "ops-agent-config.yaml" ]]; then
    echo -n "  Checking if ops-agent-config.yaml needs to be updated... "
    
    # Check if config has changed
    if [[ -f "${OPS_AGENT_CONFIG_DIR}/config.yaml" ]] && \
       sudo cmp -s ops-agent-config.yaml "${OPS_AGENT_CONFIG_DIR}/config.yaml"; then
        echo "✓ Already up to date"
    else
        echo "✓ Update needed"
        echo -n "  Installing to ${OPS_AGENT_CONFIG_DIR}/config.yaml... "
        if sudo mkdir -p "${OPS_AGENT_CONFIG_DIR}" && \
           sudo cp ops-agent-config.yaml "${OPS_AGENT_CONFIG_DIR}/config.yaml" && \
           sudo chmod 644 "${OPS_AGENT_CONFIG_DIR}/config.yaml"; then
            echo "✓"
            OPS_AGENT_NEEDS_RESTART=true
        else
            echo "✗ Failed"
            echo "  ⚠ Warning: Could not install Ops Agent config. Logging may not work correctly."
        fi
    fi
else
    echo "  ⚠ Warning: ops-agent-config.yaml not found. Skipping Ops Agent configuration."
fi
echo ""

# Function to fetch and save a parameter
fetch_parameter() {
    local param_name=$1
    local output_file=$2
    
    echo "Fetching: ${param_name}"
    
    # Get the latest version ID (sorted by creation time descending to get most recent)
    # Note: Don't use --limit with gcloud as it applies before sorting; use head instead
    local version_id=$(gcloud parametermanager parameters versions list \
        --parameter="${param_name}" \
        --location="global" \
        --sort-by="~createTime" \
        --format="table[no-heading](name)" 2>/dev/null | \
        head -1 | \
        sed 's|.*/||' | tr -d ' ')
    
    if [[ -z "${version_id}" ]]; then
        echo "  ✗ No versions found for ${param_name}"
        return 1
    fi
    
    # Fetch parameter version and extract the base64-encoded JSON data field, decode it, write to file
    if gcloud parametermanager parameters versions describe "${version_id}" \
        --parameter="${param_name}" \
        --location="global" \
        --format="json" 2>/dev/null | \
        jq -r '.payload.data' | \
        base64 -d > "${output_file}"; then
        chmod 644 "${output_file}"
        echo "  ✓ Saved to ${output_file} (${version_id})"
        return 0
    else
        echo "  ✗ Failed to fetch ${param_name} ${version_id}"
        return 1
    fi
}


# Fetch Trading API Status Topic base from Secret Manager
# Docker-compose files append -stage or -main suffix as needed
echo "Fetching Trading API Status Topic from Secret Manager..."
TRADING_API_STATUS_TOPIC_BASE=$(gcloud secrets versions access latest \
    --secret="trading-api-status-topic-base" 2>/dev/null)

if [[ -z "${TRADING_API_STATUS_TOPIC_BASE}" ]]; then
    echo "  ✗ Failed to fetch trading-api-status-topic-base"
    echo "  ⚠ Warning: TRADING_API_STATUS_TOPIC_BASE will not be set. TradingApiClient will fail to initialize."
else
    echo "  ✓ Fetched trading-api-status-topic-base"
fi
echo ""

# Create .env file with configuration
cat > .env << EOF
# Deployment configuration
DEPLOYMENT_REGION=${DEPLOYMENT_REGION}
GCP_PROJECT_ID=${GCP_PROJECT_ID}

# Cloud SQL Instance Connection Name
# Format: project-id:region:instance-name
CLOUD_SQL_INSTANCE=${CLOUD_SQL_INSTANCE}

# Trading API PubSub Topic base (docker-compose appends -stage or -main)
TRADING_API_STATUS_TOPIC_BASE=${TRADING_API_STATUS_TOPIC_BASE}
EOF

chmod 600 .env
echo "✓ Created .env file"
echo ""

# Step 2: Fetch blockchain configs from Parameter Manager
echo "Step 2: Fetching blockchain configurations from Parameter Manager..."
echo "Region: ${DEPLOYMENT_REGION}"
echo ""

# Automatically discover and fetch all configs for this region
echo "Discovering blockchain configurations matching: executor-config-*-${DEPLOYMENT_REGION}..."

# List all parameters matching the pattern and fetch them
CONFIG_COUNT=0
while IFS= read -r param_full_name; do
    if [[ -n "${param_full_name}" ]]; then
        # Extract just the parameter name (last part after /)
        param_name=$(basename "${param_full_name}")
        
        # Generate output filename from parameter name
        filename="${param_name#executor-config-}"
        output_file="${CONFIG_DIR}/${filename}.json"
        
        # Fetch the parameter
        if fetch_parameter "${param_name}" "${output_file}"; then
            CONFIG_COUNT=$((CONFIG_COUNT + 1))
        fi
    fi
done < <(gcloud parametermanager parameters list \
    --location="global" \
    --filter="name~executor-config-.*-${DEPLOYMENT_REGION}" \
    --format="value(name)" 2>/dev/null)

if [[ ${CONFIG_COUNT} -eq 0 ]]; then
    echo "  ⚠ Warning: No configurations found for region ${DEPLOYMENT_REGION}"
    echo "     Make sure parameters exist with naming pattern: executor-config-*-${DEPLOYMENT_REGION}"
else
    echo "  ✓ Successfully fetched ${CONFIG_COUNT} configuration(s)"
fi

echo ""

# Step 3: Fix file ownership for Docker containers
echo "Step 3: Setting file permissions for Docker access..."
echo "Docker containers run as UID 1001 (executor user)"

# Create a user/group matching the Docker container UID if it doesn't exist
if ! getent passwd 1001 > /dev/null 2>&1; then
    echo "Creating executor user (UID 1001) to match Docker container..."
    useradd -u 1001 -M -s /bin/false executor 2>/dev/null || true
fi

# Change ownership of secrets and configs to UID 1001
echo "Changing ownership of configs to UID 1001..."
chown -R 1001:1001 "${CONFIG_DIR}"

echo "  ✓ Files now accessible by Docker containers"
echo ""

echo "=== Deployment initialization complete ==="
echo ""
echo "Summary:"
echo "  ✓ Deployment files downloaded from Cloud Storage"
echo "  ✓ Blockchain configs fetched from Parameter Manager"
echo ""

if [[ "${OPS_AGENT_NEEDS_RESTART}" == "true" ]]; then
    echo "⚠️  IMPORTANT: Ops Agent configuration was updated!"
    echo "   You need to restart the Ops Agent for changes to take effect:"
    echo "   sudo systemctl restart google-cloud-ops-agent"
    echo ""
fi

echo "Next steps:"
echo "  1. Pull latest images:"
echo "     docker-compose -f docker-compose.base.yml -f docker-compose.stage.yml pull"
echo "     docker-compose -f docker-compose.base.yml -f docker-compose.main.yml pull"
echo ""
echo "  2. Start executors:"
echo "     docker-compose -f docker-compose.base.yml -f docker-compose.stage.yml -f docker-compose.main.yml up -d"
echo ""
echo "  3. View logs:"
echo "     docker-compose -f docker-compose.base.yml -f docker-compose.stage.yml -f docker-compose.main.yml logs -f"
echo ""
echo "Note: Docker images are built by Cloud Build and stored in gcr.io/${GCP_PROJECT_ID}/blockchain-executor"
