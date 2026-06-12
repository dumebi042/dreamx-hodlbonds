#!/bin/bash
set -e

# Upload a single blockchain configuration file to Google Parameter Manager
# Usage: ./push-config.sh <config-file.json>
#
# Example: ./push-config.sh configs/eth-sepolia-us1.json
#
# What this uploads:
# - One JSON file to Parameter Manager
# - Automatically creates parameter with proper naming and labels if it doesn't exist
# - Creates new version if parameter already exists
#
# Prerequisites:
# - gcloud CLI installed and authenticated
# - Service account has roles/parametermanager.admin (for initial creation)
#   or roles/parametermanager.parameterVersionAdder (for adding versions)
#
# Parameter naming: executor-config-{chain}-{network}-{region}
# Labels: environment={stage|main}, chain={eth|polygon|btc|avalanche}, region={us1|eu1}
# Location: global (accessible from all regions)
# Environment is auto-detected: 'main' network = production, all others = stage

PROJECT_ID="${GCP_PROJECT_ID:-$(gcloud config get-value project)}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOCATION="global"

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Validate input
if [[ $# -eq 0 ]]; then
    echo -e "${RED}Error: No config file specified${NC}"
    echo ""
    echo "Usage: $0 <config-file.json>"
    echo ""
    echo "Examples:"
    echo "  $0 configs/eth-sepolia-us1.json"
    echo "  $0 configs/avalanche-main-eu1.json"
    echo ""
    exit 1
fi

CONFIG_FILE="$1"

# Check if file exists
if [[ ! -f "${CONFIG_FILE}" ]]; then
    echo -e "${RED}Error: File not found: ${CONFIG_FILE}${NC}"
    exit 1
fi

# Check if it's a JSON file
if [[ ! "${CONFIG_FILE}" =~ \.json$ ]]; then
    echo -e "${RED}Error: File must be a .json file${NC}"
    exit 1
fi

echo "=== Uploading Config to Parameter Manager ==="
echo "Project:  ${PROJECT_ID}"
echo "Location: ${LOCATION}"
echo "File:     ${CONFIG_FILE}"
echo ""

# Check if gcloud is configured
if ! gcloud config get-value project &>/dev/null; then
    echo -e "${RED}Error: gcloud is not configured. Please run 'gcloud init' first.${NC}"
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
    
    echo -n "Processing $(basename "$file")... "
    
    # Check if parameter exists
    if gcloud parametermanager parameters describe "${param_name}" \
        --location="${LOCATION}" &>/dev/null; then
        
        # Parameter exists, get the next version number
        echo -n "adding version... "
        
        # Get existing versions and find the highest number (sorted by creation time)
        local latest_version=$(gcloud parametermanager parameters versions list \
            --parameter="${param_name}" \
            --location="${LOCATION}" \
            --sort-by="~createTime" \
            --limit=1 \
            --format="value(name)" 2>/dev/null | \
            sed 's|.*/||' | \
            sed 's/v//')
        
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
        # Parameter doesn't exist, create it first (without payload)
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

# Parse the config file
parse_result=$(parse_config_file "${CONFIG_FILE}")
if [[ $? -ne 0 ]]; then
    exit 1
fi

param_name=$(echo "$parse_result" | cut -d'|' -f1)
labels_json=$(echo "$parse_result" | cut -d'|' -f2)

echo "Parameter: ${param_name}"
echo ""

# Upload the config
if create_or_update_parameter "${CONFIG_FILE}" "$param_name" "$labels_json"; then
    echo ""
    echo -e "${GREEN}=== Upload Complete ===${NC}"
    echo ""
    echo "To view this parameter:"
    echo -e "${BLUE}  gcloud parametermanager parameters describe ${param_name} --location=${LOCATION}${NC}"
    echo ""
    echo "To view all versions:"
    echo -e "${BLUE}  gcloud parametermanager parameters versions list --parameter=${param_name} --location=${LOCATION}${NC}"
    exit 0
else
    echo ""
    echo -e "${RED}=== Upload Failed ===${NC}"
    exit 1
fi
