# Intake Deployment Guide

Deploy intake Cloud Functions with Cloud Build CI/CD using IAM database authentication.

## 🎯 Architecture

```
┌─────────────────────────────────────────────────────┐
│ Cloud Build (CI/CD)                                 │
│  stage branch push → Deploy stage intake functions  │
│  main branch push  → Deploy main intake functions   │
└─────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────┐
│ Cloud Functions (Gen2)                              │
│  ┌───────────────────────────────────────────────┐  │
│  │ stage-intake-DcaBot                           │  │
│  │ stage-intake-DcaBotFixed                      │  │
│  │ stage-intake-HodlBondsTrade                   │  │
│  │  - Pub/Sub triggered                          │  │
│  │  - IAM auth to Cloud SQL                      │  │
│  │  - Service account: hodlbonds-intake          │  │
│  └───────────────────────────────────────────────┘  │
│              │                                       │
│  ┌───────────┴───────────────────────────────────┐  │
│  │ main-intake-DcaBot                            │  │
│  │ main-intake-DcaBotFixed                       │  │
│  │ main-intake-HodlBondsTrade                    │  │
│  │  - Pub/Sub triggered                          │  │
│  │  - IAM auth to Cloud SQL                      │  │
│  │  - Service account: hodlbonds-intake          │  │
│  └───────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────┐
│ Cloud SQL (PostgreSQL)                              │
│  - blockchain_executor_stage (testnet)              │
│  - blockchain_executor_main (production)            │
│  - IAM authentication (no passwords!)               │
└─────────────────────────────────────────────────────┘
```

## 📋 Key Concepts

**Gen2 Cloud Functions:**

- Serverless, auto-scaling functions
- Triggered by Pub/Sub messages
- Built automatically with Google Cloud Buildpacks
- Artifact stored in `gcf-artifacts` repository (automatic)

**IAM Database Authentication:**

- No database passwords needed
- Service account authenticates via IAM: `hodlbonds-intake@PROJECT.iam`
- Environment variables: `DB_USER`, `DB_INSTANCE_ID`, `DB_NAME`
- Cloud Functions connects to Cloud SQL via Unix socket at `/cloudsql/INSTANCE_CONNECTION_NAME`
- Connection configured via `gcloud run services update --add-cloudsql-instances` (Gen2 requirement)

**One Function Per Branch/Executor:**

- `$BRANCH_NAME-intake-$EXECUTOR` naming pattern
- Each function processes messages for one executor type
- Allows independent scaling and configuration

**Monorepo Build:**

- Uses pnpm workspace for dependency management
- Builds all dependencies (@dreamx-development/hodlbonds-blockchain-executor-database, dto)
- Cloud Build runs from monorepo root

## Prerequisites

Before deploying, ensure you have:

1. **Cloud SQL instance** with IAM authentication enabled
2. **Databases created**: `blockchain_executor_stage` and `blockchain_executor_main`
3. **Service account** configured with proper IAM roles
4. **Database migrations** run to create tables and permissions
5. **Cloud Build** enabled and connected to GitHub repository

## Step 1: Set Up Google Cloud Infrastructure

### Enable APIs

```bash
PROJECT_ID=$(gcloud config get-value project)

gcloud services enable \
    cloudfunctions.googleapis.com \
    cloudbuild.googleapis.com \
    sqladmin.googleapis.com \
    secretmanager.googleapis.com \
    pubsub.googleapis.com \
    run.googleapis.com
```

### Create Cloud SQL Instance (if not exists)

```bash
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
```

### Create Service Accounts

```bash
# Create deployer service account for CI/CD (Cloud Build)
gcloud iam service-accounts create hodlbonds-intake-deployer \
    --display-name="Hodlbonds Blockchain Intake Deployer (CI/CD)"

# Create runtime service account for intake functions
gcloud iam service-accounts create hodlbonds-intake \
    --display-name="Hodlbonds Blockchain Intake (Runtime)"

# === Deployer Service Account Permissions (Build-Time) ===

# Grant Storage Object Viewer (for Cloud Build staging bucket)
gcloud projects add-iam-policy-binding $PROJECT_ID \
    --member="serviceAccount:hodlbonds-intake-deployer@${PROJECT_ID}.iam.gserviceaccount.com" \
    --role="roles/storage.objectViewer"

# Grant Logs Writer (for Cloud Build logs)
gcloud projects add-iam-policy-binding $PROJECT_ID \
    --member="serviceAccount:hodlbonds-intake-deployer@${PROJECT_ID}.iam.gserviceaccount.com" \
    --role="roles/logging.logWriter"

# Grant Artifact Registry Writer (for pushing function build artifacts)
gcloud projects add-iam-policy-binding $PROJECT_ID \
    --member="serviceAccount:hodlbonds-intake-deployer@${PROJECT_ID}.iam.gserviceaccount.com" \
    --role="roles/artifactregistry.writer"

# Grant Cloud Functions Developer (to deploy functions)
gcloud projects add-iam-policy-binding $PROJECT_ID \
    --member="serviceAccount:hodlbonds-intake-deployer@${PROJECT_ID}.iam.gserviceaccount.com" \
    --role="roles/cloudfunctions.developer"

# Create custom role for Cloud Run IAM management (least privilege)
gcloud iam roles create CloudRunIamManager \
    --project=$PROJECT_ID \
    --title="Cloud Run IAM Manager" \
    --description="Allows managing IAM policies on Cloud Run services" \
    --permissions=run.services.setIamPolicy

# Grant custom Cloud Run IAM Manager role (to set run.invoker on deployed functions)
gcloud projects add-iam-policy-binding $PROJECT_ID \
    --member="serviceAccount:hodlbonds-intake-deployer@${PROJECT_ID}.iam.gserviceaccount.com" \
    --role="projects/${PROJECT_ID}/roles/CloudRunIamManager"

# Grant Service Account User on runtime account (to deploy functions with --service-account)
gcloud iam service-accounts add-iam-policy-binding hodlbonds-intake@${PROJECT_ID}.iam.gserviceaccount.com \
    --member="serviceAccount:hodlbonds-intake-deployer@${PROJECT_ID}.iam.gserviceaccount.com" \
    --role="roles/iam.serviceAccountUser"

# === Runtime Service Account Permissions ===

# Grant Cloud SQL Client (for database connection)
gcloud projects add-iam-policy-binding $PROJECT_ID \
    --member="serviceAccount:hodlbonds-intake@${PROJECT_ID}.iam.gserviceaccount.com" \
    --role="roles/cloudsql.client"

# Grant Cloud SQL Instance User (for IAM database authentication)
gcloud projects add-iam-policy-binding $PROJECT_ID \
    --member="serviceAccount:hodlbonds-intake@${PROJECT_ID}.iam.gserviceaccount.com" \
    --role="roles/cloudsql.instanceUser"

# Grant Cloud Functions Invoker (for direct invocation if needed)
gcloud projects add-iam-policy-binding $PROJECT_ID \
    --member="serviceAccount:hodlbonds-intake@${PROJECT_ID}.iam.gserviceaccount.com" \
    --role="roles/cloudfunctions.invoker"
```

### Create IAM Database User

```bash
# Create IAM user for the intake service account
# This user authenticates via IAM - NO PASSWORD NEEDED!
gcloud sql users create hodlbonds-intake@${PROJECT_ID}.iam \
    --instance=blockchain-executor-db \
    --type=CLOUD_IAM_SERVICE_ACCOUNT
```

### Set Up Database Roles and Permissions

Connect to your database and set up role mappings:

```bash
# Connect to database as admin
gcloud sql connect blockchain-executor-db --user=postgres
```

In the `psql` prompt, run these commands for **each database** (stage and main):

```sql
-- Switch to stage database
\c blockchain_executor_stage

-- Create intake role if not exists
CREATE ROLE intake;

-- Map IAM user to role alias
GRANT intake TO "hodlbonds-intake@YOUR-PROJECT-ID.iam";

-- Grant database-level permissions
GRANT CONNECT ON DATABASE blockchain_executor_stage TO "hodlbonds-intake@YOUR-PROJECT-ID.iam";

-- Grant schema usage
GRANT USAGE ON SCHEMA public TO intake;

-- Table-level permissions are granted by migration file (0001_permissions.sql)
-- The intake role typically has INSERT and SELECT on queue tables

-- Repeat for main database
\c blockchain_executor_main

CREATE ROLE intake;
GRANT intake TO "hodlbonds-intake@YOUR-PROJECT-ID.iam";
GRANT CONNECT ON DATABASE blockchain_executor_main TO "hodlbonds-intake@YOUR-PROJECT-ID.iam";
GRANT USAGE ON SCHEMA public TO intake;

-- Exit psql
\q
```

**Important:** Replace `YOUR-PROJECT-ID` with your actual GCP project ID.

## Step 2: Run Database Migrations

If you haven't already, run the Drizzle migrations to create tables and set permissions:

```bash
# Install Cloud SQL Proxy locally
# See: https://cloud.google.com/sql/docs/postgres/sql-proxy#install

# Set up credentials
gcloud auth application-default login

# In one terminal, start the proxy
export INSTANCE_CONNECTION_NAME=$(gcloud sql instances describe blockchain-executor-db --format="value(connectionName)")
cloud-sql-proxy $INSTANCE_CONNECTION_NAME --port 5432

# In another terminal, run migrations
cd packages/database

# Stage database
export DATABASE_URL="postgresql://postgres@localhost:5432/blockchain_executor_stage"
pnpm drizzle-kit migrate

# Main database
export DATABASE_URL="postgresql://postgres@localhost:5432/blockchain_executor_main"
pnpm drizzle-kit migrate
```

The migrations will create the queue tables and grant proper permissions to the `intake` role.

## Step 3: Set Up Cloud Build

### Connect GitHub Repository

1. Go to **Cloud Build > Triggers** in GCP Console
2. Click **"Connect Repository"**
3. Select **GitHub** and authorize
4. Choose your `hodlbonds-blockchain-executor` repository

### Create Build Triggers

Create two triggers, one for each environment:

#### Stage Trigger (Testnet)

```bash
gcloud builds triggers create github \
    --name="intake-deploy-stage" \
    --repo-name="hodlbonds-blockchain-executor" \
    --repo-owner="DreamX-Development" \
    --branch-pattern="^stage$" \
    --build-config="apps/intake/cloudbuild.yaml" \
    --service-account="projects/$PROJECT_ID/serviceAccounts/hodlbonds-intake-deployer@${PROJECT_ID}.iam.gserviceaccount.com" \
    --included-files="apps/intake/**,packages/**,pnpm-lock.yaml,pnpm-workspace.yaml"
```

#### Main Trigger (Production)

```bash
gcloud builds triggers create github \
    --name="intake-deploy-main" \
    --repo-name="hodlbonds-blockchain-executor" \
    --repo-owner="DreamX-Development" \
    --branch-pattern="^main$" \
    --build-config="apps/intake/cloudbuild.yaml" \
    --service-account="projects/$PROJECT_ID/serviceAccounts/hodlbonds-intake-deployer@${PROJECT_ID}.iam.gserviceaccount.com" \
    --included-files="apps/intake/**,packages/**,pnpm-lock.yaml,pnpm-workspace.yaml"
```

**Note:** The triggers use the `hodlbonds-intake-deployer` service account for CI/CD operations. The deployed functions run as the separate `hodlbonds-intake` runtime service account, providing security separation between build and runtime environments.

### Grant Cloud Build Permissions

The deployer service account has the following permissions for Cloud Build and deployment:

**Build-time permissions:**

- `storage.objectViewer` - Read from Cloud Build staging bucket
- `logging.logWriter` - Write build logs
- `artifactregistry.writer` - Push function container images

**Deployment permissions:**

- `cloudfunctions.developer` - Deploy Cloud Functions
- `iam.serviceAccountUser` (on runtime account) - Deploy functions with the runtime service account
<!-- - `run.developer` - Deploy Cloud Run services (Gen2 functions) -->

**Runtime permissions** (on `hodlbonds-intake` account):

- `cloudsql.client`, `cloudsql.instanceUser` - Database access
- `cloudfunctions.invoker` - Function invocation
- `logging.logWriter` - Write runtime logs

## Step 4: Create Pub/Sub Topics

Create Pub/Sub topics for each executor and environment:

```bash
# Stage topics
gcloud pubsub topics create stage-intake-DcaBot
gcloud pubsub topics create stage-intake-DcaBotFixed
gcloud pubsub topics create stage-intake-HodlBondsTrade

# Main topics
gcloud pubsub topics create main-intake-DcaBot
gcloud pubsub topics create main-intake-DcaBotFixed
gcloud pubsub topics create main-intake-HodlBondsTrade
```

## Step 5: Deploy

### Initial Deployment

Push to the `stage` or `main` branch to trigger automatic deployment:

```bash
# Deploy to stage
git checkout stage
git push origin stage

# Or deploy to production
git checkout main
git push origin main
```

Cloud Build will:

1. Install pnpm
2. Install all monorepo dependencies
3. Build the intake package (and its dependencies)
4. Deploy one Cloud Function per executor type

### Monitor Deployment

```bash
# View build logs in real-time
gcloud builds log --stream

# Or in the GCP Console
# Cloud Build > History
```

### Verify Deployment

```bash
# List deployed functions
gcloud functions list --gen2 --filter="name~intake"

# Check a specific function
gcloud functions describe stage-intake-DcaBot --gen2 --region=us-central1

# Verify Cloud SQL connection configuration
gcloud run services describe stage-intake-DcaBot --region=us-central1 \
    --format="value(spec.template.spec.containers[0].env)" | grep -E "DB_USER|DB_INSTANCE_ID|DB_NAME"

# View function logs
gcloud functions logs read stage-intake-DcaBot --gen2 --region=us-central1 --limit=50
```

**Note on Cloud SQL Connection:** Cloud Functions Gen2 requires a two-step deployment:

1. First, `gcloud functions deploy` creates the function
2. Then, `gcloud run services update --add-cloudsql-instances` configures the Cloud SQL connection

This is because Gen2 functions are built on Cloud Run, and the Cloud SQL connection must be configured at the Cloud Run service level. The `cloudbuild.yaml` handles both steps automatically.

## 🔧 Daily Operations

### Deploy New Code

Simply push to the `stage` or `main` branch:

```bash
git checkout stage
git add .
git commit -m "Update intake logic"
git push origin stage
```

Cloud Build automatically deploys the changes.

### Test a Function Manually

```bash
# Publish a test message to the Pub/Sub topic
gcloud pubsub topics publish stage-intake-DcaBot \
    --message='{"test": "data"}'

# View logs
gcloud functions logs read stage-intake-DcaBot --gen2 --region=us-central1 --limit=10
```

### Update Environment Variables

To change environment variables for a deployed function:

```bash
gcloud functions deploy stage-intake-DcaBot \
    --gen2 \
    --region=us-central1 \
    --update-env-vars=LOG_LEVEL=debug
```

Or update the `cloudbuild-template.ejs`, regenerate, and redeploy.

## 📊 Monitoring

### View Logs

```bash
# Recent logs for a specific function
gcloud functions logs read stage-intake-DcaBot --gen2 --region=us-central1

# Follow logs in real-time
gcloud functions logs read stage-intake-DcaBot --gen2 --region=us-central1 --stream

# Filter by severity
gcloud functions logs read stage-intake-DcaBot --gen2 --region=us-central1 --filter="severity>=ERROR"
```

### Check Metrics

In GCP Console:

1. Go to **Cloud Functions**
2. Click on a function name
3. View **Metrics** tab for invocations, execution time, memory usage

### Set Up Alerts

Create alert policies in **Monitoring > Alerting** for:

- Function error rate
- Function execution time
- Database connection failures

## 🐛 Troubleshooting

### Function Fails to Deploy

```bash
# Check Cloud Build logs
gcloud builds log --stream

# Common issues:
# - Missing substitution: Ensure _CLOUD_SQL_INSTANCE is set in trigger
# - Permission errors: Verify Cloud Build service account has necessary roles
# - Build timeout: Increase timeout in cloudbuild.yaml or trigger settings
```

### Database Connection Errors

```bash
# Verify IAM user exists
gcloud sql users list --instance=blockchain-executor-db

# Check service account has cloudsql.client role
gcloud projects get-iam-policy $PROJECT_ID \
    --flatten="bindings[].members" \
    --filter="bindings.role:roles/cloudsql.client"

# Test database connection from Cloud Shell
gcloud sql connect blockchain-executor-db --user=postgres
```

### Function Not Receiving Messages

```bash
# Check Pub/Sub topic exists
gcloud pubsub topics list

# Verify function is subscribed to topic
gcloud pubsub subscriptions list --filter="topic~intake"

# Manually trigger
gcloud pubsub topics publish stage-intake-DcaBot --message='{"test": true}'
```

### Permission Errors in Logs

```bash
# Check database role mapping
gcloud sql connect blockchain-executor-db --user=postgres
# Then in psql:
# \c blockchain_executor_stage
# \du hodlbonds-intake@YOUR-PROJECT-ID.iam

# Verify table permissions
# SELECT grantee, privilege_type FROM information_schema.role_table_grants WHERE table_name='queue_table';
```

## 📈 Adding New Executors

When adding a new executor type:

1. **Update DTO enum** in `packages/dto/src/index.ts`
2. **Regenerate cloudbuild.yaml**:
   ```bash
   cd apps/intake
   pnpm run prepare-cloudbuild-template
   ```
3. **Create Pub/Sub topics**:
   ```bash
   gcloud pubsub topics create stage-intake-NewExecutor
   gcloud pubsub topics create main-intake-NewExecutor
   ```
4. **Push to deploy**:
   ```bash
   git add .
   git commit -m "Add NewExecutor type"
   git push origin stage
   ```

## 🔒 Security Best Practices

1. **Never commit service account emails** - Use `$PROJECT_ID` substitution
2. **Use IAM authentication** - No database passwords in code or env vars
3. **Minimal permissions** - Intake service account only has necessary roles
4. **Environment separation** - Separate service accounts for stage/main (optional)
5. **Audit logs** - Enable Cloud Audit Logs for function invocations

## 📝 Files Reference

### Key Files

- `cloudbuild-template.ejs` - EJS template for Cloud Build config (edit this!)
- `cloudbuild.yaml` - Generated Cloud Build config (auto-generated, don't edit)
- `tsdown.config.ts` - Build configuration for bundling
- `.gcloudignore` - Files excluded from deployment
- `package.json` - Package metadata and scripts
- `DEPLOYMENT.md` - This file

### Generate cloudbuild.yaml

After editing the template:

```bash
cd apps/intake
pnpm run prepare-cloudbuild-template
git add cloudbuild.yaml
git commit -m "Update Cloud Build configuration"
```

## 🆘 Support

For issues or questions:

1. Check Cloud Build logs: `gcloud builds log --stream`
2. Check function logs: `gcloud functions logs read FUNCTION_NAME --gen2 --region=us-central1`
3. Review IAM permissions: `gcloud projects get-iam-policy $PROJECT_ID`
4. Consult executor deployment guide for database setup details
