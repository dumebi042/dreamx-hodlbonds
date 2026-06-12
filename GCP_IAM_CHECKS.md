# GCP IAM Policy Verification Commands

> **Status:** ❌ Could not verify — no GCP credentials with access to the DreamX HODLBonds project are available from this workstation.
>
> The current `gcloud` CLI environment and Application Default Credentials (ADC) authenticate as `ozordumebi@gmail.com`, which only has access to 3 personal projects (none of which are the DreamX project).
>
> **Required action:** Run the commands below from a machine/account that has access to the DreamX Development GCP organization.

Run these commands from a machine with `gcloud` CLI and access to the DreamX HODLBonds GCP project.

## Prerequisites

```bash
# Authenticate with the correct GCP account (use the account that has access to the DreamX project)
gcloud auth login

# Set the active project (replace PROJECT_ID with the actual project ID)
gcloud config set project PROJECT_ID

# Verify you're authenticated and on the right project
gcloud config get-value project
```

---

## Actual Results (Executed 2026-06-12)

### Command 1: `gcloud auth list`

```
No credentialed accounts.

To login, run:
  $ gcloud auth login `ACCOUNT`
```

### Command 2: `gcloud auth application-default print-access-token` (ADC)

```
ya29.a0AT3oNZ9mEH5bagPWLIOBSUQ2O-5D-h3hipT1kU6EQls0cQBVHRB...
```

✅ ADC token obtained — token belongs to `ozordumebi@gmail.com`

### Command 3: `gcloud config get-value project`

```
(unset)
```

### Command 4: List accessible GCP projects (via Resource Manager API)

Only 3 projects accessible via ADC:

| Project ID                   | Project Name     |
| ---------------------------- | ---------------- |
| `gen-lang-client-0535625746` | Gemini Project   |
| `idyllic-ethos-344808`       | My First Project |
| `learning-86848`             | Learning         |

None of these are the DreamX HODLBonds project.

### Command 5: PubSub topic listing + IAM checks

**Attempt via gcloud (fails):**

```
ERROR: (gcloud.pubsub.topics.list) You do not currently have an active account selected.
Please run:

  $ gcloud auth login
```

**Attempt via REST API on all 3 accessible projects:**

- `gen-lang-client-0535625746` — No PubSub topics, no service accounts
- `idyllic-ethos-344808` — No PubSub topics, no service accounts
- `learning-86848` — No PubSub topics; 1 SA (`firebase-adminsdk`)

### Command 6: Service account listing

```
ERROR: (gcloud.iam.service-accounts.list) The required property [project] is not currently set.
```

No DreamX-related service accounts accessible from this workstation.

---

### Verdict: C1 Exploitability — ⚠️ Cannot Verify Remotely

The GCP IAM policy of the DreamX HODLBonds project **cannot be checked from this workstation** because:

1. **No gcloud credentials** are configured for the DreamX organization
2. **ADC credentials** (`ozordumebi@gmail.com`) only have access to personal projects
3. The actual GCP **project ID is not hardcoded** in the codebase — it uses `$PROJECT_ID` Cloud Build substitution variables

**To complete the C1 validation, someone must run the IAM policy checks from:**

- A machine with `gcloud` authenticated as a DreamX GCP IAM principal, **OR**
- Cloud Shell (which inherits the project's service account), **OR**
- A machine with a service account key for the DreamX project

The commands are already documented in this file and ready to execute.

---

## 1. List Service Accounts

Check what HODLBonds-related service accounts exist in the project:

```bash
gcloud iam service-accounts list \
  --project="$(gcloud config get-value project)" \
  --filter="email~hodlbonds" \
  --format="table(email,displayName)"
```

Expected accounts (from codebase analysis):
| Service Account | Purpose |
|----------------|---------|
| `hodlbonds-intake@$PROJECT_ID.iam.gserviceaccount.com` | Blockchain executor intake runtime (Cloud Functions) |
| `hodlbonds-intake-deployer@$PROJECT_ID.iam.gserviceaccount.com` | Intake CI/CD deployer |
| `hodlbonds-executor@$PROJECT_ID.iam.gserviceaccount.com` | Blockchain executor runtime (GCE) |
| `hodlbonds-api-intake@$PROJECT_ID.iam.gserviceaccount.com` | API intake (Cloud Run) |
| `hodlbonds-trading-api@$PROJECT_ID.iam.gserviceaccount.com` | Trading API (Cloud Run) |
| `hodlbonds-api@$PROJECT_ID.iam.gserviceaccount.com` | Public API / Server (Cloud Run) |
| `hodlbonds-api-deployer@$PROJECT_ID.iam.gserviceaccount.com` | API CI/CD deployer |
| `price-oracle-runtime@$PROJECT_ID.iam.gserviceaccount.com` | Price oracle (Cloud Run Jobs) |

---

## 2. Check IAM on All 6 Intake PubSub Topics

Check each of the 6 intake topics. These are Cloud Function PubSub triggers for the blockchain executor intake. **Purpose: Determine C1 exploitability** — if any topic allows non-`hodlbonds-trading-api` principals to publish, the zero-trust gap is exploitable.

```bash
PROJECT="$(gcloud config get-value project)"

for topic in stage-intake-DcaBot stage-intake-DcaBotFixed stage-intake-HodlBondsTrade \
             main-intake-DcaBot main-intake-DcaBotFixed main-intake-HodlBondsTrade; do
  echo "=== $topic ==="
  gcloud pubsub topics get-iam-policy "$topic" --project="$PROJECT" 2>&1
  echo ""
done
```

**What to look for:**

- Which principals have `roles/pubsub.publisher`?
- If **only** `hodlbonds-trading-api@$PROJECT_ID.iam.gserviceaccount.com` has publisher — C1 is blocked at infrastructure level
- If **any other** principal (especially `allUsers`, `allAuthenticatedUsers`, or another SA) has publisher — C1 is exploitable
- If a topic doesn't exist → note which one(s)

---

## 3. Check Status Update Topics

These are the topics the trading-api publishes order status updates to:

```bash
PROJECT="$(gcloud config get-value project)"

for topic in order-status-updates-stage order-status-updates-main; do
  echo "=== projects/$PROJECT/topics/$topic ==="
  gcloud pubsub topics get-iam-policy "projects/$PROJECT/topics/$topic" --project="$PROJECT" 2>&1
  echo ""
done
```

**What to look for:**

- Who has `roles/pubsub.publisher`? If publicly writable, C2 extends to status spoofing.

---

## 4. Check for `EXECUTOR_PUBSUB_TOPIC` Secret

The trading-api reads the executor PubSub topic name from Secret Manager:

```bash
gcloud secrets list \
  --project="$(gcloud config get-value project)" \
  --filter="name~executor-pubsub-topic" 2>&1
```

Also check for branch-specific versions (from the cloudbuild.yaml):

```bash
gcloud secrets list \
  --project="$(gcloud config get-value project)" \
  --filter="name~trading-api-executor-pubsub-topic" 2>&1
```

**What to look for:**

- Does the secret exist?
- What are its IAM bindings? (run `gcloud secrets get-iam-policy trading-api-executor-pubsub-topic-stage --project="$PROJECT"`)
- Can a non-`hodlbonds-trading-api` SA access it?

---

## Summary of What This Tells Us

| Command                      | Validates                                                       | For Finding                            |
| ---------------------------- | --------------------------------------------------------------- | -------------------------------------- |
| Topic IAM on 6 intake topics | Whether non-trading-api principals can publish to intake topics | **C1: Executor Intake Zero-Trust Gap** |
| Status topic IAM             | Whether status topics are publicly writable                     | **C2: Status Injection**               |
| Secret Manager list          | Whether `EXECUTOR_PUBSUB_TOPIC` secret exists                   | **NS3: Topic Name Exposure**           |
| Service accounts list        | What SAs exist and their naming convention                      | Confirms architecture assumptions      |

---

## Context from Codebase

From [`dreamx-hodlbonds-api/apps/trading-api/src/lib/pubsub-auth.ts`](dreamx-hodlbonds-api/apps/trading-api/src/lib/pubsub-auth.ts):

- The trading-api uses OIDC token authentication to publish to the executor PubSub topic
- The publisher identity is `hodlbonds-trading-api@$PROJECT_ID.iam.gserviceaccount.com`

From [`dreamx-hodlbonds-api/apps/trading-api/cloudbuild.yaml`](dreamx-hodlbonds-api/apps/trading-api/cloudbuild.yaml#L58):

```yaml
--set-env-vars=PUBSUB_SERVICE_ACCOUNT_EMAIL=hodlbonds-trading-api@$PROJECT_ID.iam.gserviceaccount.com
```

From [`CRITICAL_CANDIDATES.md`](CRITICAL_CANDIDATES.md#L109):

> Verify that an appropriately-authenticated PubSub publisher (NOT the trading-api's service account) can successfully push a task to the executor DB through the intake
> If PubSub IAM is locked to only the trading-api SA, this path is blocked at the infrastructure level — **this requires the IAM config check**
