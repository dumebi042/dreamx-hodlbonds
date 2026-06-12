# Executor Deployment Guide

Deploy blockchain executors to Google Compute Engine with Cloud Build CI/CD.

## 🎯 Architecture

```
┌─────────────────────────────────────────────────────┐
│ Cloud Build (CI/CD)                                 │
│  stage branch push → gcr.io/PROJECT/executor:stage  │
│  main branch push  → gcr.io/PROJECT/executor:main   │
└─────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────┐
│ GCE Instance: hodlbonds-executor-us1                │
│  ┌───────────────────────────────────────────────┐  │
│  │ Cloud SQL Proxy (shared)                      │  │
│  └───────────┬───────────────────────────────────┘  │
│              │                                       │
│  ┌───────────┴───────────────────┐                  │
│  │ Stage Executors (Testnets)    │                  │
│  │  - pulls executor:stage       │  → blockchain_executor_stage
│  │  - configs: *-stage-us1       │                  │
│  └───────────────────────────────┘                  │
│              │                                       │
│  ┌───────────┴───────────────────┐                  │
│  │ Main Executors (Mainnets)     │                  │
│  │  - pulls executor:main        │  → blockchain_executor_main
│  │  - configs: *-main-us1        │                  │
│  └───────────────────────────────┘                  │
│                                                      │
│  Shared: Global seed phrase (all executors)         │
└─────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────┐
│ GCE Instance: hodlbonds-executor-eu1                │
│  Same structure as US1                              │
│  Both stage + main executors run on single VM       │
│  Configs: *-stage-eu1 / *-main-eu1                  │
│  Shared: Same global seed phrase as US1             │
└─────────────────────────────────────────────────────┘
```

## 📋 Key Concepts

**CI/CD with Cloud Build:**

- Push to `stage` or `main` branch triggers automatic build
- Images pushed to Container Registry: `gcr.io/PROJECT/blockchain-executor:stage|main`
- GCE instances pull pre-built images (no local builds)
- No need for separate git checkouts or directories

**Single VM Deployment (Important!):**

- Both stage AND main executors run on the SAME GCE instance
- No separate VMs for stage vs main
- Share one Cloud SQL Proxy connection per VM
- Each executor connects to its own database (stage or main)
- Share one GLOBAL seed phrase (all regions use same seed)
- Two VMs total: us1 and eu1 (not four VMs)

**Environments:** `stage` (testnets) vs `main` (mainnets)

- Different git branches with potentially different code
- Different databases in same Cloud SQL instance
- Separate docker-compose files pulling different image tags

**Regions:** `us1` vs `eu1`

- Different GCE instances
- Region-specific configs (different wallet offsets and RPCs)
- Same global seed phrase across all regions

**Region-Specific Configs:**

- Each region needs separate configs: `eth-main-us1`, `eth-main-eu1`
- Configs differ in: wallet offsets, RPC endpoints
- Same seed phrase, but different wallet derivation offsets per region

## Step 1: Set Up Cloud Build

### Enable APIs

```bash
gcloud services enable compute.googleapis.com \
    sqladmin.googleapis.com \
    secretmanager.googleapis.com \
    cloudbuild.googleapis.com \
    containerregistry.googleapis.com
```

### Connect GitHub Repository

1. Go to Cloud Build > Triggers in GCP Console
2. Click "Connect Repository"
3. Select GitHub and authorize
4. Choose your `hodlbonds-blockchain-executor` repository

### Create Build Triggers

Create two triggers - one for each branch:

**Stage Trigger:**

- Name: `executor-stage-build`
- Event: Push to branch
- Branch: `^stage$`
- Configuration: Cloud Build configuration file
- Location: `apps/executor/cloudbuild.yaml`

**Main Trigger:**

- Name: `executor-main-build`
- Event: Push to branch
- Branch: `^main$`
- Configuration: Cloud Build configuration file
- Location: `apps/executor/cloudbuild.yaml`

Now every push to `stage` or `main` branches automatically builds and pushes Docker images.

## Step 2: Set Up Google Cloud Infrastructure

### Create Cloud SQL Instance

```bash
PROJECT_ID=$(gcloud config get-value project)

# Create Postgres instance with IAM authentication enabled
gcloud sql instances create blockchain-executor-db \
    --database-version=POSTGRES_15 \
    --tier=db-custom-2-7680 \
    --region=us-central1 \
    --network=default \
    --database-flags=cloudsql.iam_authentication=on

# Create BOTH databases (stage and main)
gcloud sql databases create blockchain_executor_stage --instance=blockchain-executor-db
gcloud sql databases create blockchain_executor_main --instance=blockchain-executor-db

# Set postgres admin password (store securely, rarely used)
# Only needed for emergency admin access
gcloud sql users set-password postgres \
    --instance=blockchain-executor-db \
    --password="$(openssl rand -base64 32)"  # Generate secure random password
```

### Create Service Account

```bash
# Create service account
gcloud iam service-accounts create hodlbonds-executor \
    --display-name="Hodlbonds Blockchain Executor"

# Grant Cloud SQL Client (for database access via proxy)
gcloud projects add-iam-policy-binding $PROJECT_ID \
    --member="serviceAccount:hodlbonds-executor@${PROJECT_ID}.iam.gserviceaccount.com" \
    --role="roles/cloudsql.client"

# Grant Cloud SQL Instance User (for IAM database authentication)
gcloud projects add-iam-policy-binding $PROJECT_ID \
    --member="serviceAccount:hodlbonds-executor@${PROJECT_ID}.iam.gserviceaccount.com" \
    --role="roles/cloudsql.instanceUser"

# Grant Secret Manager access (for seed phrase)
gcloud projects add-iam-policy-binding $PROJECT_ID \
    --member="serviceAccount:hodlbonds-executor@${PROJECT_ID}.iam.gserviceaccount.com" \
    --role="roles/secretmanager.secretAccessor"

# Grant Parameter Manager access (for blockchain configs)
gcloud projects add-iam-policy-binding $PROJECT_ID \
    --member="serviceAccount:hodlbonds-executor@${PROJECT_ID}.iam.gserviceaccount.com" \
    --role="roles/parametermanager.parameterAccessor"

# Grant Parameter Manager Viewer (for listing versions)
gcloud projects add-iam-policy-binding $PROJECT_ID \
    --member="serviceAccount:hodlbonds-executor@${PROJECT_ID}.iam.gserviceaccount.com" \
    --role="roles/parametermanager.parameterViewer"

# Grant Cloud Logging write access (for application logs)
gcloud projects add-iam-policy-binding $PROJECT_ID \
    --member="serviceAccount:hodlbonds-executor@${PROJECT_ID}.iam.gserviceaccount.com" \
    --role="roles/logging.logWriter"

# Grant Monitoring Metric Writer (for custom metrics)
gcloud projects add-iam-policy-binding $PROJECT_ID \
    --member="serviceAccount:hodlbonds-executor@${PROJECT_ID}.iam.gserviceaccount.com" \
    --role="roles/monitoring.metricWriter"

# Grant Cloud Storage read access (for deployment files)
gcloud projects add-iam-policy-binding $PROJECT_ID \
    --member="serviceAccount:hodlbonds-executor@${PROJECT_ID}.iam.gserviceaccount.com" \
    --role="roles/storage.objectViewer"

# Grant Artifact Registry Writer (for pushing container images from Cloud Build)
gcloud projects add-iam-policy-binding $PROJECT_ID \
    --member="serviceAccount:hodlbonds-executor@${PROJECT_ID}.iam.gserviceaccount.com" \
    --role="roles/artifactregistry.writer"

# Grant Artifact Registry Create-on-Push Writer (for auto-creating repos)
gcloud projects add-iam-policy-binding $PROJECT_ID \
    --member="serviceAccount:hodlbonds-executor@${PROJECT_ID}.iam.gserviceaccount.com" \
    --role="roles/artifactregistry.createOnPushWriter"

# Grant Guest Policy Viewer Beta (for VM configuration management)
gcloud projects add-iam-policy-binding $PROJECT_ID \
    --member="serviceAccount:hodlbonds-executor@${PROJECT_ID}.iam.gserviceaccount.com" \
    --role="roles/osconfig.guestPolicyViewer"
```

### Create IAM Database User (No Password!)

```bash
# Create IAM user for the executor service account
# This user authenticates via IAM - NO PASSWORD NEEDED!
gcloud sql users create hodlbonds-executor@${PROJECT_ID}.iam \
    --instance=blockchain-executor-db \
    --type=CLOUD_IAM_SERVICE_ACCOUNT

# If you have intake service (optional):
gcloud sql users create hodlbonds-intake@${PROJECT_ID}.iam \
    --instance=blockchain-executor-db \
    --type=CLOUD_IAM_SERVICE_ACCOUNT
```

### Set Up Database Roles and Permissions

This is a one-time setup that:

1. Creates role aliases (`executor`, `intake`, `reports`) for migration compatibility
2. Maps IAM users to these roles
3. Grants database access

```bash
# Connect to database as admin
gcloud sql connect blockchain-executor-db --user=postgres

# When prompted, enter the admin password you set earlier
```

In the `psql` prompt, run these commands for **each database** (stage and main):

```sql
-- Switch to stage database
\c blockchain_executor_stage

-- Create role aliases (these match your Drizzle migrations)
CREATE ROLE executor;
CREATE ROLE intake;
CREATE ROLE reports;

-- Map IAM users to role aliases
-- This allows your migrations to use simple role names like "executor"
-- while actual authentication happens via IAM users
GRANT executor TO "hodlbonds-executor@YOUR-PROJECT-ID.iam";
GRANT intake TO "hodlbonds-intake@YOUR-PROJECT-ID.iam";
-- reports is for read-only analytics, no IAM user needed

-- Grant database-level permissions to IAM users (minimal for connection)
GRANT CONNECT ON DATABASE blockchain_executor_stage TO "hodlbonds-executor@YOUR-PROJECT-ID.iam";
GRANT CONNECT ON DATABASE blockchain_executor_stage TO "hodlbonds-intake@YOUR-PROJECT-ID.iam";

-- Grant schema usage (required to access tables)
GRANT USAGE ON SCHEMA public TO executor;
GRANT USAGE ON SCHEMA public TO intake;
GRANT USAGE ON SCHEMA public TO reports;

-- Table-level permissions will be granted by migration file (0001_permissions.sql)
-- This gives fine-grained control: executor gets SELECT+UPDATE, intake gets SELECT+INSERT, etc.

-- Repeat for main database
\c blockchain_executor_main

CREATE ROLE executor;
CREATE ROLE intake;
CREATE ROLE reports;

GRANT executor TO "hodlbonds-executor@YOUR-PROJECT-ID.iam";
GRANT intake TO "hodlbonds-intake@YOUR-PROJECT-ID.iam";

GRANT CONNECT ON DATABASE blockchain_executor_main TO "hodlbonds-executor@YOUR-PROJECT-ID.iam";
GRANT CONNECT ON DATABASE blockchain_executor_main TO "hodlbonds-intake@YOUR-PROJECT-ID.iam";

GRANT USAGE ON SCHEMA public TO executor;
GRANT USAGE ON SCHEMA public TO intake;
GRANT USAGE ON SCHEMA public TO reports;

-- Exit psql
\q
```

**Important:** Replace `YOUR-PROJECT-ID` with your actual GCP project ID.

**Why role aliases?** Your Drizzle migrations use simple role names (`executor`, `intake`, `reports`). By creating these as role aliases in Cloud SQL and mapping IAM users to them, your migrations work identically in both local development (password-based roles) and production (IAM-based authentication).

### Run Database Migrations

After setting up roles, run your Drizzle migrations to create tables and apply permissions.

#### Authenticate Cloud SQL Proxy

Cloud SQL Proxy uses [Application Default Credentials (ADC)](https://cloud.google.com/docs/authentication/provide-credentials-adc) to authenticate to Google Cloud. For local development, use your user credentials:

```bash
# Authenticate with your Google Cloud user account
# This grants Cloud SQL Admin permissions to the proxy
gcloud auth application-default login
```

This opens a browser for authentication. The credentials are stored locally and automatically used by Cloud SQL Proxy.

**Note:** Service account keys are [not recommended by Google](https://cloud.google.com/docs/authentication/best-practices-applications#local-dev-service-account-keys) for local development. ADC is simpler and more secure.

#### Install Cloud SQL Proxy

```bash
# macOS Apple Silicon
curl -o cloud-sql-proxy https://storage.googleapis.com/cloud-sql-connectors/cloud-sql-proxy/v2.19.0/cloud-sql-proxy.darwin.arm64
chmod +x cloud-sql-proxy
sudo mv cloud-sql-proxy /usr/local/bin/

# For other operating systems, see:
# https://cloud.google.com/sql/docs/postgres/sql-proxy#install
```

#### Set Up Database Password

The proxy handles authentication to GCP, but you still need a password to connect to the Postgres database itself. Store it securely in `~/.pgpass`:

```bash
# Create/edit ~/.pgpass file (replace YOUR_PASSWORD with the postgres password you set earlier)
echo "localhost:5432:*:postgres:YOUR_PASSWORD" >> ~/.pgpass
chmod 600 ~/.pgpass
```

**What's `~/.pgpass`?**

- Standard PostgreSQL password file
- Format: `hostname:port:database:username:password`
- `*` wildcard matches any database
- `chmod 600` ensures only you can read it
- PostgreSQL clients automatically use this file (no password in environment variables!)

#### Run Migrations

```bash
# Stop local Docker Postgres to free port 5432
pnpm db:stop

# Terminal 1: Start Cloud SQL Proxy
# (uses ADC credentials from gcloud auth application-default login)
export INSTANCE_CONNECTION_NAME=$(gcloud sql instances describe blockchain-executor-db --format="value(connectionName)")
cloud-sql-proxy $INSTANCE_CONNECTION_NAME --port 5432

# Terminal 2: Run migrations
# (uses password from ~/.pgpass automatically)
export DATABASE_URL="postgresql://postgres@localhost:5432/blockchain_executor_stage"

cd packages/database
pnpm drizzle-kit migrate

# Repeat for main database
export DATABASE_URL="postgresql://postgres@localhost:5432/blockchain_executor_main"
pnpm drizzle-kit migrate
```

**How authentication works:**

1. **Cloud SQL Proxy → GCP**: Uses ADC (your user credentials via `gcloud auth application-default login`)
2. **Your app → Postgres**: Uses password from `~/.pgpass` file
3. **Two separate authentications**: Proxy authenticates to GCP, then you authenticate to the database

**Security benefits:**

- ✅ No passwords in environment variables or code
- ✅ No service account keys to manage
- ✅ Uses your personal GCP credentials (proper audit trail)
- ✅ Standard PostgreSQL password management

Your migrations in `drizzle/0000_init.sql` and `drizzle/0001_permissions.sql` will now run successfully because:

- Tables get created by `0000_init.sql`
- Permissions get granted to `executor`, `intake`, `reports` roles by `0001_permissions.sql`
- IAM users inherit those permissions through role membership

## Step 3: Store Secrets and Configs

### Seed Phrase (Secret Manager)

The seed phrase is the only true "secret" and is stored in Secret Manager. The executor fetches it at runtime via the Secret Manager API — it is never written to disk:

```bash
# ONE seed phrase for ALL regions/chains
# Different regions use different wallet offsets from same seed
cat /path/to/global-seed-phrase.txt | \
    gcloud secrets create executor-seed-phrase --data-file=-
```

### Trading API Status Topic (Secret Manager)

The PubSub topic base for order status updates (docker-compose appends `-stage` or `-main`):

```bash
# Base topic - docker-compose files append -stage or -main suffix
echo -n "projects/YOUR_PROJECT/topics/order-status-updates" | \
    gcloud secrets create trading-api-status-topic-base --data-file=-
```

### Blockchain Configs (Parameter Manager)

Blockchain configurations (RPC endpoints, wallet offsets, etc.) are stored in **Parameter Manager**, not Secret Manager. This keeps your actual secrets list clean and provides better tooling for config management.

#### Prepare Your Config Files

1. Create config files in `apps/executor/deployment/configs/`:

   ```bash
   cd apps/executor/deployment
   # Directory already exists and is git-ignored
   ```

2. Create JSON files following this naming convention:

   ```
   {chain}-{network}-{region}.json
   ```

   Examples:
   - `eth-sepolia-us1.json` (stage testnet for US region)
   - `eth-main-us1.json` (mainnet for US region)
   - `polygon-amoy-eu1.json` (stage testnet for EU region)

**Config file format example (US1):**

```json
{
  "serverName": "us-central1",
  "networkName": "eth-main",
  "executionManager": {
    "executorRegion": "US1",
    "network": "eth",
    "processQueueDelay": 1000,
    "executorConfig": {
      "minimumGasPrice": "0.000000020",
      "maximumPriorityFeePerGas": "0.000000050",
      "overBidPercent": 110
    }
  },
  "walletManager": {
    "providerEndpoint": "https://mainnet.infura.io/v3/YOUR_KEY",
    "chainId": 1,
    "walletCount": 10,
    "walletOffset": 0,
    "refuelAmount": "0.1",
    "gasBalanceLowWaterMarkEther": "0.05"
  }
}
```

**Config file format example (EU1):**

```json
{
  "serverName": "eu-west3",
  "networkName": "eth-main",
  "executionManager": {
    "executorRegion": "EU1",
    "network": "eth",
    "processQueueDelay": 1000,
    "executorConfig": {
      "minimumGasPrice": "0.000000020",
      "maximumPriorityFeePerGas": "0.000000050",
      "overBidPercent": 110
    }
  },
  "walletManager": {
    "providerEndpoint": "https://mainnet.infura.io/v3/YOUR_KEY",
    "chainId": 1,
    "walletCount": 10,
    "walletOffset": 100,
    "refuelAmount": "0.1",
    "gasBalanceLowWaterMarkEther": "0.05"
  }
}
```

**Key differences between regions:**

- `walletOffset`: Different per region to avoid wallet collision (US1: 0, EU1: 100, etc.)
- `providerEndpoint`: Region-specific RPC endpoints (optional, can use same endpoint)
- `serverName`: Region identifier (us-central1, eu-west3, etc.)
- `executorRegion`: Region code (US1, EU1, etc.)

#### Upload Configs to Parameter Manager

Use the provided script to upload all configs at once:

```bash
cd apps/executor/deployment

# Upload all config files from configs/ directory
# Script automatically:
# - Parses filenames to determine parameter names
# - Creates parameters with proper labels (environment, chain, network, region)
# - Creates new versions if parameters already exist
./push-configs.sh
```

**To upload a single config file** (faster when only one chain changes):

```bash
# Upload just one config
./push-config.sh configs/eth-sepolia-us1.json

# Upload after editing one chain's config
./push-config.sh configs/avalanche-main-eu1.json
```

The script creates parameters with this naming pattern:

```
executor-config-{chain}-{network}-{region}
```

Examples:

- `executor-config-eth-sepolia-us1`
- `executor-config-eth-main-us1`
- `executor-config-polygon-amoy-eu1`

Each parameter is labeled for easy filtering:

- `environment`: stage or main
- `chain`: eth, polygon, btc
- `region`: us1, eu1

**To view all parameters:**

```bash
gcloud parametermanager parameters list
```

**To update a config:**

1. Edit the JSON file in `deployment/configs/`
2. Run `./push-configs.sh` again (creates a new version automatically)

### Deployment Files (Cloud Storage)

Deployment files (docker-compose.yml, init-deployment.sh) are stored in Cloud Storage:

#### Create Storage Bucket (One-Time)

```bash
# Create bucket
gsutil mb -p ${PROJECT_ID} -l us-central1 gs://blockchain-executor-deployments

# Grant service account read access
gsutil iam ch serviceAccount:hodlbonds-executor@${PROJECT_ID}.iam.gserviceaccount.com:roles/storage.objectViewer \
    gs://blockchain-executor-deployments
```

#### Upload Deployment Files

Use the provided script:

```bash
cd apps/executor/deployment

# Upload docker-compose files and init-deployment.sh
# Run this whenever you update these files
./push-deployment-files.sh
```

The script uploads:

- `docker-compose.base.yml`
- `docker-compose.stage.yml`
- `docker-compose.main.yml`
- `init-deployment.sh`
- `ops-agent-config.yaml`

**To update deployment files:**

1. Edit the file locally
2. Run `./push-deployment-files.sh`
3. On GCE instances, run `init-deployment.sh` again to fetch updates

## Step 4: Create GCE Instances

### US1 Instance

```bash
PROJECT_ID=$(gcloud config get-value project)
CLOUD_SQL_INSTANCE=$(gcloud sql instances describe blockchain-executor-db --format="value(connectionName)")

gcloud compute instances create hodlbonds-executor-us1 \
    --zone=us-central1-a \
    --machine-type=e2-standard-4 \
    --service-account=hodlbonds-executor@${PROJECT_ID}.iam.gserviceaccount.com \
    --scopes=cloud-platform \
    --image-family=ubuntu-2204-lts \
    --image-project=ubuntu-os-cloud \
    --boot-disk-size=50GB \
    --metadata=startup-script='#!/bin/bash
      curl -fsSL https://get.docker.com -o get-docker.sh
      sh get-docker.sh
      curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
      chmod +x /usr/local/bin/docker-compose
      apt-get update && apt-get install -y google-cloud-sdk
      # Configure docker to authenticate with GCR
      gcloud auth configure-docker
    '
```

### EU1 Instance

```bash
gcloud compute instances create hodlbonds-executor-eu1 \
    --zone=europe-west1-b \
    --machine-type=e2-standard-4 \
    --service-account=hodlbonds-executor@${PROJECT_ID}.iam.gserviceaccount.com \
    --scopes=cloud-platform \
    --image-family=ubuntu-2204-lts \
    --image-project=ubuntu-os-cloud \
    --boot-disk-size=50GB \
    --metadata=startup-script='#!/bin/bash
      curl -fsSL https://get.docker.com -o get-docker.sh
      sh get-docker.sh
      curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
      chmod +x /usr/local/bin/docker-compose
      apt-get update && apt-get install -y google-cloud-sdk
      # Configure docker to authenticate with GCR
      gcloud auth configure-docker
    '
```

## Step 5: Deploy to GCE Instances

### Initial Setup (US1)

```bash
# SSH to instance
gcloud compute ssh hodlbonds-executor-us1 --zone=us-central1-a

# On the instance - set up deployment directory and set the user to have perms to the new directory
cd /opt
sudo mkdir -p /opt/blockchain-executor-deployment
sudo chown $USER:$USER /opt/blockchain-executor-deployment
cd /opt/blockchain-executor-deployment

# Set environment variables for init-deployment.sh
export DEPLOYMENT_REGION=us1
export GCP_PROJECT_ID=$(gcloud config get-value project)
export CLOUD_SQL_INSTANCE=$(gcloud sql instances describe blockchain-executor-db --format="value(connectionName)")

# Download and run init-deployment.sh
# This script automatically:
# 1. Creates configs/ directory
# 2. Fetches trading-api-status-topic-base from Secret Manager
# 3. Creates .env file from environment variables
# 4. Downloads deployment files from Cloud Storage
# 5. Installs Ops Agent configuration if changed
# 6. Fetches blockchain configs from Parameter Manager

gsutil cp gs://blockchain-executor-deployments/init-deployment.sh .
chmod +x init-deployment.sh
sudo -E ./init-deployment.sh

# Pull latest images and start containers
docker-compose -f docker-compose.base.yml -f docker-compose.stage.yml -f docker-compose.main.yml pull
docker-compose -f docker-compose.base.yml -f docker-compose.stage.yml -f docker-compose.main.yml up -d

# View logs
docker-compose -f docker-compose.base.yml -f docker-compose.stage.yml -f docker-compose.main.yml logs -f
```

### Deploy EU1 Instance

```bash
# SSH to EU1 instance
gcloud compute ssh hodlbonds-executor-eu1 --zone=europe-west1-b

# On the instance - set up deployment directory
cd /opt
mkdir -p blockchain-executor-deployment
cd blockchain-executor-deployment

# Set environment variables for EU1
export DEPLOYMENT_REGION=eu1
export GCP_PROJECT_ID=$(gcloud config get-value project)
export CLOUD_SQL_INSTANCE=$(gcloud sql instances describe blockchain-executor-db --format="value(connectionName)")

# Download and run init-deployment.sh
gsutil cp gs://blockchain-executor-deployments/init-deployment.sh .
chmod +x init-deployment.sh
sudo -E ./init-deployment.sh

# Pull latest images and start containers
docker-compose -f docker-compose.base.yml -f docker-compose.stage.yml -f docker-compose.main.yml pull
docker-compose -f docker-compose.base.yml -f docker-compose.stage.yml -f docker-compose.main.yml up -d
```

## 🔧 Daily Operations

### Deploy New Code

When you push to `stage` or `main` branch, Cloud Build automatically builds new images. To deploy:

```bash
cd /opt/blockchain-executor-deployment

# Pull latest images
docker-compose -f docker-compose.base.yml -f docker-compose.stage.yml -f docker-compose.main.yml pull

# Restart containers with new images
docker-compose -f docker-compose.base.yml -f docker-compose.stage.yml -f docker-compose.main.yml up -d

# Verify
docker-compose -f docker-compose.base.yml -f docker-compose.stage.yml -f docker-compose.main.yml ps
```

### View Logs

```bash
cd /opt/blockchain-executor-deployment

# All containers
docker-compose -f docker-compose.base.yml -f docker-compose.stage.yml -f docker-compose.main.yml logs -f

# Just stage
docker-compose -f docker-compose.base.yml -f docker-compose.stage.yml logs -f

# Just main
docker-compose -f docker-compose.base.yml -f docker-compose.main.yml logs -f

# Specific container
docker logs -f executor-eth-main
```

### Restart Containers

```bash
cd /opt/blockchain-executor-deployment

# All containers
docker-compose -f docker-compose.base.yml -f docker-compose.stage.yml -f docker-compose.main.yml restart

# Just stage
docker-compose -f docker-compose.base.yml -f docker-compose.stage.yml restart

# Just main
docker-compose -f docker-compose.base.yml -f docker-compose.main.yml restart

# Specific container
docker restart executor-eth-main
```

### Rotate Secrets

```bash
# For seed phrase (Secret Manager) — executor fetches at runtime, so just restart containers
echo -n "new-value" | \
    gcloud secrets versions add executor-seed-phrase --data-file=-

# Restart containers to pick up the new seed phrase
docker-compose -f docker-compose.base.yml -f docker-compose.stage.yml -f docker-compose.main.yml restart

# For configs (Parameter Manager)
# Edit local file, then:
cd apps/executor/deployment
./push-configs.sh

# Back on GCE instance, re-fetch configs and restart
# init-deployment.sh automatically loads environment variables from existing .env file
sudo -E ./init-deployment.sh
docker-compose -f docker-compose.base.yml -f docker-compose.stage.yml -f docker-compose.main.yml restart
```

### View Logs in Cloud Logging

Application logs are sent to Google Cloud Logging with structured fields for easy filtering and analysis.

**Structured Log Fields:**

- `severity`: Log level (DEBUG, INFO, WARNING, ERROR, CRITICAL)
- `component`: Logger name (e.g., ExecutionManager, WalletManager, DatabaseProvider)
- `server`: Deployment region (us1, eu1)
- `network`: Blockchain network (eth-sepolia, metis-sepolia, avalanche-main, etc.)

**View in GCP Console:**

1. Go to Logging > Logs Explorer
2. Use filters to query logs:
   ```
   resource.type="gce_instance"
   labels.component="ExecutionManager"
   labels.network="eth-sepolia"
   severity>=WARNING
   ```

**Ops Agent Configuration:**

The Ops Agent is configured to parse Docker JSON logs and automatically extract structured fields from the application's log output. Configuration is managed in `ops-agent-config.yaml` and deployed via `init-deployment.sh`.

- **Location on VM:** `/etc/google-cloud-ops-agent/config.yaml`
- **Restart Agent:** `sudo systemctl restart google-cloud-ops-agent`
- **Check Status:** `sudo systemctl status google-cloud-ops-agent`
- **View Agent Logs:** `sudo journalctl -u google-cloud-ops-agent -f`

**Log Retention:**

- Local Docker logs: Max 20MB per container (2 files × 10MB, compressed, non-blocking)
- Cloud Logging: 30 days default (configurable in GCP Console under Logging > Log Storage)

**Configuration Updates:**

The `init-deployment.sh` script automatically:

1. Downloads `ops-agent-config.yaml` from Cloud Storage
2. Compares it with the existing configuration on the VM
3. Updates `/etc/google-cloud-ops-agent/config.yaml` if changed
4. Notifies you to restart the Ops Agent if configuration was updated

To manually update the Ops Agent configuration:

```bash
# From local machine - push updated config
cd apps/executor/deployment
./push-deployment-files.sh

# On GCE instance - download and apply
cd /opt/blockchain-executor-deployment
sudo -E ./init-deployment.sh

# If config changed, restart Ops Agent
sudo systemctl restart google-cloud-ops-agent
```

### Update Deployment Files

When docker-compose files or init-deployment.sh change:

```bash
# From local machine
cd apps/executor/deployment
./push-deployment-files.sh

# On each GCE instance
cd /opt/blockchain-executor-deployment
# init-deployment.sh automatically loads environment variables from existing .env file
sudo -E ./init-deployment.sh  # Re-downloads deployment files from Cloud Storage
docker-compose -f docker-compose.base.yml -f docker-compose.stage.yml -f docker-compose.main.yml up -d
```

### Update Blockchain Configs

When RPC endpoints, offsets, or other config changes:

```bash
# From local machine
cd apps/executor/deployment
# Edit files in configs/ directory
./push-configs.sh  # Creates new versions in Parameter Manager

# On each GCE instance
cd /opt/blockchain-executor-deployment
# init-deployment.sh automatically loads environment variables from existing .env file
sudo -E ./init-deployment.sh  # Re-fetches latest configs
docker-compose -f docker-compose.base.yml -f docker-compose.stage.yml -f docker-compose.main.yml restart
```

### Managing Executor Transaction ABIs

At initial deployment and when updating the vault contract, ABIs must be added or updated in the database. The `contracts` table stores contract ABIs that executors reference when interacting with blockchain contracts.

**Important context:**

- **Primary key:** `(network, contract_name)` - this combination must be unique
- **Auto-incremented id:** The `id` field auto-increments; do not set manually
- **Auto-updated timestamp:** A database trigger automatically sets `last_updated` on INSERT/UPDATE
- **Permissions:** Only the `postgres` admin user can INSERT/UPDATE contracts. The executor service account has read-only (SELECT) access
- **Network codes:** Use 3-character codes matching your configs (e.g., `'eth'`, `'ava'`, `'btc'`)

#### Connect to Database

All ABI operations require `postgres` admin access:

```bash
# Connect via Cloud SQL Proxy (ensure it's running on port 5432)
gcloud sql connect blockchain-executor-db --user=postgres --database=blockchain_executor_stage

# Or for production
gcloud sql connect blockchain-executor-db --user=postgres --database=blockchain_executor_main
```

#### Insert a New ABI

Use this when adding a contract ABI for the first time. If the `(network, contract_name)` combination already exists, this will fail with a primary key violation.

```sql
INSERT INTO contracts (network, contract_name, address, abi)
VALUES (
  'ava',                                              -- 3-char network code
  'Vault',                                            -- Contract name
  '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb',      -- Contract address (42 chars)
  '[{"type":"function","name":"deposit","inputs":[...]}]'::jsonb  -- Full ABI as JSONB
);
```

**Notes:**

- Do NOT include `id` (auto-increments) or `last_updated` (set by trigger)
- The ABI must be valid JSON. Use `'...'::jsonb` to cast the string to JSONB
- The full ABI is a JSON array of **function & error definitions** from your contract compilation

#### Update an Existing ABI

Use this when you've deployed a new version of a contract and need to update its ABI. The primary key `(network, contract_name)` identifies which contract to update.

```sql
UPDATE contracts
SET
  abi = '[{"type":"function","name":"deposit","inputs":[...]}]'::jsonb,
  address = '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb'  -- Optional: update address if contract redeployed
WHERE
  network = 'ava'
  AND contract_name = 'Vault';
```

**Notes:**

- Do NOT manually set `last_updated` - the trigger handles this automatically
- Update `address` if the contract was redeployed to a new address
- If the WHERE clause matches no rows, the UPDATE silently succeeds but changes nothing

#### Upsert (Insert or Update)

Use this approach when you want to insert if not exists, or update if exists. This is safer for deployment scripts:

```sql
INSERT INTO contracts (network, contract_name, address, abi)
VALUES (
  'ava',
  'Vault',
  '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb',
  '[{"type":"function","name":"deposit","inputs":[...]}]'::jsonb
)
ON CONFLICT (network, contract_name)
DO UPDATE SET
  abi = EXCLUDED.abi,
  address = EXCLUDED.address;
```

**Notes:**

- `ON CONFLICT` detects existing `(network, contract_name)` primary key
- `EXCLUDED` references the values from the INSERT that would have been inserted
- The trigger updates `last_updated` whether inserting or updating
- This is idempotent - safe to run multiple times

#### Verify the ABI

After inserting or updating, verify the change:

```sql
SELECT
  id,
  network,
  contract_name,
  address,
  last_updated,
  jsonb_array_length(abi) AS abi_function_count
FROM contracts
WHERE network = 'ava' AND contract_name = 'Vault';
```

## 🐛 Troubleshooting

### Can't connect to database

```bash
# Check Cloud SQL Proxy
docker logs cloud-sql-proxy

# Test connection
docker exec -it executor-btc-main nc -zv cloud-sql-proxy 5432

# Verify service account
gcloud projects get-iam-policy $(gcloud config get-value project) \
    --flatten="bindings[].members" \
    --filter="bindings.role:roles/cloudsql.client"
```

### Wrong containers started

Check your environment variables and compose files:

```bash
echo $ENVIRONMENT
echo $DEPLOYMENT_REGION
git branch --show-current
```

### Can't fetch secrets

```bash
# Test secret access (seed phrase)
gcloud secrets versions access latest --secret="executor-seed-phrase"

# Test parameter access (configs)
gcloud parametermanager parameters versions access latest --parameter="executor-config-eth-main-us1"

# Check Secret Manager permissions
gcloud secrets get-iam-policy executor-seed-phrase

# Check Parameter Manager permissions
gcloud projects get-iam-policy $(gcloud config get-value project) \
    --flatten="bindings[].members" \
    --filter="bindings.role:roles/parametermanager.parameterAccessor"

# Check Cloud Storage permissions (deployment files)
gsutil iam get gs://blockchain-executor-deployments
```

## 🔒 Security Notes

1. **Git branches enforce separation** - Stage branch can only deploy testnets
2. **One seed phrase, stored in Secret Manager** - True secret, fetched at runtime via API (never written to disk)
3. **Configs in Parameter Manager** - RPC keys and settings separate from secrets
4. **Deployment files in Cloud Storage** - Appropriate storage for static files
5. **No DB credentials** - Cloud SQL Proxy handles authentication
6. **Read-only config mounts** - Configs mounted as read-only in containers

## 💰 Costs (Approximate Monthly)

**Per GCE Instance (both stage + main on same VM):**

- US1 (e2-standard-4): ~$120
- EU1 (e2-standard-4): ~$120

**Shared Resources:**

- Cloud SQL: ~$200
- Secret Manager: ~$0.50 (just seed phrase)
- Parameter Manager: ~$0.50 (configs)
- Cloud Storage: ~$0.10 (deployment files)

**Total for full setup**: ~$441/month

## 📈 Adding More Chains

### For Stage (Testnets)

1. Create config file locally:

   ```bash
   cd apps/executor/deployment/configs
   # Create avalanche-fuji-us1.json with proper config
   ```

2. Upload to Parameter Manager:

   ```bash
   cd apps/executor/deployment
   ./push-configs.sh
   ```

3. Add to `docker-compose.stage.yml`:

   ```yaml
   executor-avalanche-fuji:
     # ... same pattern as other services
     volumes:
       - ./configs/avalanche-fuji.json:/app/config/config.json:ro
   ```

4. Push updated docker-compose file:

   ```bash
   ./push-deployment-files.sh
   ```

5. On GCE instances, re-run init and restart:
   ```bash
   sudo -E ./init-deployment.sh
   docker-compose -f docker-compose.base.yml -f docker-compose.stage.yml -f docker-compose.main.yml up -d
   ```

### For Main (Mainnets)

Same process, but add to `docker-compose.main.yml` instead

## ❓ FAQ

**Q: Why separate docker-compose files?**  
A: Cleaner separation between testnets (stage) and mainnets (main). You can start/stop/view logs for each environment independently while they coexist on the same VM.

**Q: Why one global seed phrase?**  
A: Simpler to manage. All chains in all regions use the same seed, different derivation paths (via wallet offsets in configs).

**Q: Both stage and main on the same VM?**  
A: Yes! This is the recommended approach. They share the Cloud SQL Proxy and run side-by-side. No resource contention since stage (testnets) is typically low-traffic.

**Q: Why Parameter Manager instead of Secret Manager for configs?**  
A: Parameter Manager is designed for configuration files (1 MiB limit, JSON/YAML support, better versioning). Secret Manager is for actual secrets (seed phrase). This keeps your secrets list clean and provides better tooling for config management.

**Q: Why Cloud Storage for deployment files?**  
A: More appropriate than Secret Manager for static files. Versioned, easy to update, better semantics.

**Q: What if I only want to run US region?**  
A: Just skip creating the EU1 instance. You only need configs for regions you deploy (e.g., `*-us1` configs only).

**Q: How do I add a third region (e.g., asia)?**  
A: Create a third GCE instance `hodlbonds-executor-asia1` and region-specific configs with suffix `-asia1`. Use the same global seed phrase.

**Q: How do I update configs after initial setup?**  
A: Edit the JSON files locally in `deployment/configs/`, run `./push-configs.sh`, then on GCE instances run `./init-deployment.sh` and restart containers.

**Q: How do I update deployment files after initial setup?**  
A: Edit the docker-compose files locally, run `./push-deployment-files.sh`, then on GCE instances run `./init-deployment.sh` and restart containers.
