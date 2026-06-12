#!/bin/bash
set -e

# Upload blockchain configuration files to Google Parameter Manager
# Run this script whenever you update blockchain configs (RPC endpoints, offsets, etc.)
#
# What this uploads:
# - All JSON files from deployment/configs/ directory
# - Automatically creates parameters with proper naming and labels
# - Creates new versions if parameters already exist
#
# Prerequisites:
# - gcloud CLI installed and authenticated
# - Service account has roles/parametermanager.admin (for initial creation)
#   or roles/parametermanager.parameterVersionAdder (for adding versions)
# - JSON config files placed in deployment/configs/
#
# Parameter naming: executor-config-{chain}-{network}-{region}
# Labels: environment={stage|main}, chain={eth|polygon|btc|avalanche}, region={us1|eu1}
# Location: global (accessible from all regions)
# Environment is auto-detected: 'main' network = production, all others = stage

PROJECT_ID="${GCP_PROJECT_ID:-$(gcloud config get-value project)}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONFIGS_DIR="${SCRIPT_DIR}/configs"
LOCATION="global"

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo "=== Uploading Blockchain Configs to Parameter Manager ==="
echo "Project:  ${PROJECT_ID}"
echo "Location: ${LOCATION}"
echo "Configs:  ${CONFIGS_DIR}"
echo ""

# Check if gcloud is configured
if ! gcloud config get-value project &>/dev/null; then
    echo -e "${RED}Error: gcloud is not configured. Please run 'gcloud init' first.${NC}"
    exit 1
fi

# Check if configs directory exists
if [[ ! -d "${CONFIGS_DIR}" ]]; then
    echo -e "${RED}Error: Configs directory not found: ${CONFIGS_DIR}${NC}"
    echo ""
    echo "Create the directory and add your JSON config files:"
    echo -e "${YELLOW}  mkdir -p ${CONFIGS_DIR}${NC}"
    echo ""
    exit 1
fi

# Check if any JSON files exist
if ! ls "${CONFIGS_DIR}"/*.json &>/dev/null; then
    echo -e "${RED}Error: No JSON files found in ${CONFIGS_DIR}${NC}"
    echo ""
    echo "Add your blockchain config JSON files to this directory."
    echo ""
    exit 1
fi

# Function to parse filename and determine parameter name and labels
parse_config_file() {
    local filename=$(basename "$1" .json)
    local param_name=""
    local labels_json=""
    
    # Parse filename: {chain}-{network}-{region}.json
    # Examples: eth-sepolia-us1.json, polygon-amoy-eu1.json, btc-main-us1.json
    
    if [[ $filename =~ ^([a-z]+)-([^-]+)-(us1|eu1)$ ]]; then
        local chain="${BASH_REMATCH[1]}"
        local network="${BASH_REMATCH[2]}"
        local region="${BASH_REMATCH[3]}"
        
        # Determine environment based on network
        # If network is "main" or "mainnet", it's production; otherwise it's stage (testnet)
        local environment="stage"
        if [[ "$network" == "main" || "$network" == "mainnet" ]]; then
            environment="main"
        fi
        
        # Build parameter name: executor-config-{chain}-{network}-{region}
        param_name="executor-config-${chain}-${network}-${region}"
        
        # Build labels as JSON format (required by Parameter Manager API)
        labels_json="{\"environment\":\"${environment}\",\"chain\":\"${chain}\",\"region\":\"${region}\"}"
        
        echo "${param_name}|${labels_json}"
        return 0
    else
        echo -e "${RED}Error: Invalid filename format: ${filename}${NC}"
        echo "Expected format: {chain}-{network}-{region}.json"
        echo "  chain: eth, polygon, btc, avalanche, etc."
        echo "  network: sepolia, amoy, fuji, testnet, main, etc."
        echo "  region: us1, eu1"
        echo ""
        echo "Environment is auto-detected: network='main' → production, all others → stage"
        return 1
    fi
}

# Function to create or update a parameter
create_or_update_parameter() {
    local file=$1
    local param_name=$2
    local labels_json=$3
    
    echo -n "  Processing $(basename "$file")... "
    
    # Check if parameter exists
    if gcloud parametermanager parameters describe "${param_name}" \
        --location="${LOCATION}" &>/dev/null; then
        
        # Parameter exists, get the next version number
        echo -n "adding version... "
        
        # Get existing versions and find the highest number
        local latest_version=$(gcloud parametermanager parameters versions list \
            --parameter="${param_name}" \
            --location="${LOCATION}" \
            --format="value(name)" 2>/dev/null | \
            sed 's|.*/||' | \
            grep -E '^v[0-9]+$' | \
            sed 's/v//' | \
            sort -n | \
            tail -1)
        
        # Increment version number (start at 1 if no versions exist)
        local next_version=$((${latest_version:-0} + 1))
        local version_id="v${next_version}"
        
        # Read and compact JSON
        local json_payload=$(cat "${file}" | jq -c .)
        
        # Create version with JSON payload
        if gcloud parametermanager parameters versions create "${version_id}" \
            --parameter="${param_name}" \
            --location="${LOCATION}" \
            --payload-data="${json_payload}" &>/dev/null; then
            echo -e "${GREEN}✓ (${version_id})${NC}"
            return 0
        else
            echo -e "${RED}✗ Failed to create version${NC}"
            return 1
        fi
    else
        # Parameter doesn't exist, create it first
        echo -n "creating parameter... "
        
        # Extract label values from JSON for gcloud command format
        local environment=$(echo "${labels_json}" | jq -r '.environment')
        local chain=$(echo "${labels_json}" | jq -r '.chain')
        local region=$(echo "${labels_json}" | jq -r '.region')
        
        if gcloud parametermanager parameters create "${param_name}" \
            --location="${LOCATION}" \
            --parameter-format="JSON" \
            --labels="environment=${environment},chain=${chain},region=${region}" &>/dev/null; then
            
            echo -n "adding initial version... "
            
            # Read and compact JSON
            local json_payload=$(cat "${file}" | jq -c .)
            
            # Add the first version (v1) with payload
            if gcloud parametermanager parameters versions create "v1" \
                --parameter="${param_name}" \
                --location="${LOCATION}" \
                --payload-data="${json_payload}" &>/dev/null; then
                echo -e "${GREEN}✓ (created with v1)${NC}"
                return 0
            else
                echo -e "${RED}✗ Failed to create initial version${NC}"
                return 1
            fi
        else
            echo -e "${RED}✗ Failed to create parameter${NC}"
            return 1
        fi
    fi
}

# Process each JSON file
echo "Processing configuration files..."
SUCCESS_COUNT=0
FAIL_COUNT=0

for file in "${CONFIGS_DIR}"/*.json; do
    if [[ -f "$file" ]]; then
        # Parse filename to get parameter name and labels
        parse_result=$(parse_config_file "$file")
        if [[ $? -eq 0 ]]; then
            param_name=$(echo "$parse_result" | cut -d'|' -f1)
            labels_json=$(echo "$parse_result" | cut -d'|' -f2)
            
            if create_or_update_parameter "$file" "$param_name" "$labels_json"; then
                ((SUCCESS_COUNT++))
            else
                ((FAIL_COUNT++))
            fi
        else
            ((FAIL_COUNT++))
        fi
    fi
done

echo ""
if [[ $FAIL_COUNT -eq 0 ]]; then
    echo -e "${GREEN}=== Upload Complete ===${NC}"
    echo "Successfully uploaded ${SUCCESS_COUNT} configuration(s)"
else
    echo -e "${YELLOW}=== Upload Complete with Errors ===${NC}"
    echo "Success: ${SUCCESS_COUNT}, Failed: ${FAIL_COUNT}"
fi
echo ""
echo "To view parameters:"
echo -e "${BLUE}  gcloud parametermanager parameters list --location=${LOCATION} --project=${PROJECT_ID}${NC}"
echo ""
echo "To view a specific parameter:"
echo -e "${BLUE}  gcloud parametermanager parameters describe PARAMETER_NAME --location=${LOCATION} --project=${PROJECT_ID}${NC}"
echo ""
echo "To grant GCE service account access:"
echo -e "${YELLOW}  gcloud projects add-iam-policy-binding ${PROJECT_ID} \\
    --member='serviceAccount:SERVICE_ACCOUNT_EMAIL' \\
    --role='roles/parametermanager.parameterAccessor'${NC}"
echo ""
