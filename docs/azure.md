KnowledgeStack runs on Microsoft Azure as two container apps and one Postgres server. This note explains what each Azure piece is, how to create the deployment once, and how a push to `main` releases a new version after that.

## What runs where

Each thing the laptop runs has one replacement on Azure.

- A service in `docker-compose.yml`, such as `api`, becomes a **Container App**. Azure Container Apps runs your image, restarts it after a crash, and gives it an HTTPS address.
- One running container becomes a **replica**, which is one running copy of a Container App.
- The `api-migrate` service becomes a **Container Apps job**: a container that runs one task to the end and then stops.
- The `app-db` and `tenant-db` containers become two databases on one **Azure Database for PostgreSQL** server. Azure installs, updates and backs up that server.
- A line in `apps/api/.env` becomes a **secret**, a value Azure stores encrypted and hands to the container as an environment variable.
- Docker Hub becomes **GitHub Container Registry** at `ghcr.io`, the server that stores the images Azure downloads.
- `docker-compose.yml` becomes `infra/main.bicep`. **Bicep** is Azure's language for listing the resources you want to exist.
- `docker compose up` becomes `az deployment group create`, the command that makes Azure match the file.

Both apps scale to zero. After 300 seconds with no request, Azure stops the replica and the charge stops with it. The next request starts a replica again, so the first visitor after a quiet period waits several extra seconds.

Everything lives in one **resource group** named `rg-knowledgestack`. A resource group works like a folder, and deleting it removes the whole deployment.

## What it costs

Azure for Students gives a $100 credit for 12 months and a set of free monthly amounts. This deployment is sized to stay inside the free amounts.

- Container Apps is free up to 180,000 vCPU-seconds and 360,000 GiB-seconds a month. With both apps running, that is about 66 hours a month.
- One `B1ms` Postgres server with 32 GB of disk is free for the first 12 months. From month 13 it costs about $16 a month, paid from the credit.
- When the credit reaches $0, Microsoft turns the subscription off. The app stops and no bill arrives.

Check the balance once a month at https://www.microsoftazuresponsorships.com.

## Set it up once

### 1. Install the Azure CLI and pick a region

```bash
brew install azure-cli
az login
```

A student subscription may create resources in about five regions only. In the Azure portal, open Policy, then Assignments, then `Allowed resource deployment regions`, and read the list under Parameters. Pick one region from it and confirm that it offers the `Standard_B1ms` size:

```bash
az postgres flexible-server list-skus --location <region> --output table
```

### 2. Create the resource group

A new subscription has to switch on each kind of resource before its first use.

```bash
az provider register --namespace Microsoft.App --wait
az provider register --namespace Microsoft.DBforPostgreSQL --wait
az provider register --namespace Microsoft.OperationalInsights --wait
az provider register --namespace Microsoft.ManagedIdentity --wait
az group create --name rg-knowledgestack --location <region>
```

### 3. Publish the images

Push to `main`. The `publish` job in `.github/workflows/ci.yml` builds three images and uploads them to `ghcr.io/jerrychen751`, each tagged with the commit SHA.

Azure downloads the images without a password, so each package must be public. A package that a workflow of a public repository pushes starts public, and the first run on 2026-10-07 produced three public packages. To check, open https://github.com/jerrychen751?tab=packages. If one shows as private, open it and set its visibility to public under Package settings.

### 4. Fill in the secrets

```bash
cp infra/.env.example infra/.env
```

Fill every value. Git ignores `infra/.env`, and the values never reach GitHub. Keep `TOKEN_ENCRYPTION_KEY` in a password manager too: every stored OAuth token and database password is encrypted with it, so a lost key makes them unreadable.

### 5. Apply the Bicep file

Preview the change, then apply it.

```bash
pnpm azure:what-if
pnpm azure:apply
```

Both run `scripts/apply-azure-infrastructure.mjs`, which loads `infra/.env`, picks the image version, and calls `az deployment group`. `what-if` lists what Azure would create and changes nothing. `apply` prints six outputs. The rest of this note calls them by name: `webAppUrl`, `mcpUrl`, `postgresHost`, `azureClientId`, `azureTenantId` and `azureSubscriptionId`.

### 6. Run the migrations

```bash
az containerapp job start --name api-migrate --resource-group rg-knowledgestack
az containerapp job execution list --name api-migrate --resource-group rg-knowledgestack --output table
```

Run the second command again until the status reads `Succeeded`. If it reads `Failed`, open the job in the portal and read the console log of that execution.

### 7. Load the demo company database

On the laptop, Docker runs the six files in `seed-data/tenant_company/` the first time `tenant-db` starts. Azure has no such step, so run them once with `psql`. The laptop has no `psql` until you install the Postgres client tools:

```bash
brew install libpq
export PATH="$(brew --prefix libpq)/bin:$PATH"
```

The server's firewall admits addresses inside Azure only, so add a rule for the laptop first. `<server>` is the first part of `postgresHost`, before `.postgres.database.azure.com`.

```bash
MY_IP=$(curl -s https://api.ipify.org)
az postgres flexible-server firewall-rule create --resource-group rg-knowledgestack --name <server> --rule-name laptop --start-ip-address "$MY_IP" --end-ip-address "$MY_IP"
```

Load the tables and the data:

```bash
export PGHOST=<postgresHost> PGUSER=ksadmin PGSSLMODE=verify-full PGSSLROOTCERT=system
export PGPASSWORD=$(node --env-file=infra/.env --print "process.env.POSTGRES_ADMIN_PASSWORD")

for file in seed-data/tenant_company/0[1-5]_*.sql; do
  psql --dbname tenant_company --set ON_ERROR_STOP=1 --file "$file"
done
```

`06_readonly_role.sql` creates the role `agent_readonly` with a password that this public repository shows. Run that file and a password change in one transaction, so the server never holds the role with the published password:

```bash
AGENT_PASSWORD=$(node -e "console.log(require('node:crypto').randomBytes(24).toString('base64url'))")
psql --dbname tenant_company --set ON_ERROR_STOP=1 --single-transaction \
  --file seed-data/tenant_company/06_readonly_role.sql \
  --command "ALTER ROLE agent_readonly PASSWORD '$AGENT_PASSWORD'"
echo "$AGENT_PASSWORD"
```

Save the printed password. You type it into the app in step 9.

In Postgres every role may connect to every database on a server unless you say otherwise. The two databases share one server here, so stop `agent_readonly` from opening the application database:

```bash
psql --dbname knowledgestack --set ON_ERROR_STOP=1 \
  --command "REVOKE CONNECT ON DATABASE knowledgestack FROM PUBLIC" \
  --command "GRANT CONNECT ON DATABASE knowledgestack TO ksadmin"
```

Remove the laptop rule:

```bash
az postgres flexible-server firewall-rule delete --resource-group rg-knowledgestack --name <server> --rule-name laptop --yes
```

### 8. Tell the sign-in providers the new address

Each provider returns the browser to a redirect URL that you register with it.

- In the [Google Cloud console](https://console.cloud.google.com/apis/credentials), add `<webAppUrl>/api/auth/google/callback` to the OAuth client.
- On the same console's OAuth consent screen, keep the app in Testing mode with your account as the only test user. Google then turns away every other account before it reaches the app.
- For Notion and Confluence, add `<webAppUrl>/api/sources/oauth/callback`.

### 9. Use the app

Open `webAppUrl`, sign in, create a workspace and upload `seed-data/wiki/`. On `/databases`, register the demo database with these values:

- Host: `postgresHost`
- Port: `5432`
- Database: `tenant_company`
- Read-only role: `agent_readonly`
- Password: the one step 7 printed
- Require TLS: checked

### 10. Turn on automatic releases

The `deploy` job skips itself until these three repository variables exist. They are IDs, and they are safe to show.

```bash
gh variable set AZURE_CLIENT_ID --body <azureClientId>
gh variable set AZURE_TENANT_ID --body <azureTenantId>
gh variable set AZURE_SUBSCRIPTION_ID --body <azureSubscriptionId>
```

## What a push to main does

1. `verify` and `containers` run. A failure stops here.
2. `publish` builds the three images and uploads them, tagged with the commit SHA.
3. `deploy` signs in to Azure. GitHub issues a signed token that names this repository and the `main` branch, and Azure trades it for a token that lasts about an hour. No Azure password is stored in GitHub.
4. `deploy` points the `api-migrate` job at the new image, starts it and waits. If the migration fails, the job stops and the old version keeps running.
5. `deploy` points `api` and then `web` at the new images. Azure starts each new version beside the old one and moves traffic to it once it answers its health check.

## Change the infrastructure later

Apply the Bicep file again after you edit it or change a value in `infra/.env`.

```bash
pnpm azure:what-if
pnpm azure:apply
```

The Bicep file also sets the image version of each app, and an older version would put old code on a newer database. The script avoids that: it asks Azure which version `api` runs now and applies with that one. Only the first apply, when no app exists yet, uses the commit at the tip of `main` on GitHub, so wait for its `publish` job to finish first.

## Checks after the first deployment

- `curl <apiUrl>/health/ready` answers 200 with `{"status":"ok"}`, where `<apiUrl>` is `mcpUrl` without `/mcp`. The API reached Postgres over TLS.
- Opening `webAppUrl` in a private window lands on `<webAppUrl>/signin`. A redirect to `0.0.0.0:3000` means Next.js built the URL from its internal address, and `apps/web/proxy.ts` needs to use the public one.
- After sign-in, the `ks_session` cookie carries the `Secure` flag.
- `SELECT indexname FROM pg_indexes WHERE indexname = 'document_chunks_embedding_idx'` returns one row. No row means a migration dropped the vector index.
- An answer in the browser appears a few words at a time. An answer that arrives all at once means something between the browser and the API holds the stream back.
- Asking the agent to insert a row gets the answer that the database is read-only. The `execute_sql` tool refuses any statement that does not start with `SELECT` or `WITH`.
- `curl -X POST <mcpUrl>` with no token answers 401.
- After 10 quiet minutes, `az containerapp replica list --name api --resource-group rg-knowledgestack` prints an empty list.

## Read the logs

```bash
az containerapp logs show --name api --resource-group rg-knowledgestack --follow
```

The line `Deployment name: production` near the top confirms that the replica loaded the Azure settings. In the first week, open each app's `Replicas` chart in the portal. It should read zero most of the day. If it never does, automated scanners are keeping the apps running, and the free amount will run out.

## Limits to know

- Azure cuts off any single HTTP request at 240 seconds. A sync that takes longer shows an error in the browser and keeps running inside the API. Press Sync again: the pass skips every document it already indexed.
- The app keeps the address Azure assigned. Deleting and recreating the Container Apps environment changes that address, and then step 8 has to be repeated.
- Microsoft may remove running resources after 90 days with no activity on the subscription. A release counts as activity.

## Remove everything

```bash
az group delete --name rg-knowledgestack
```

This deletes both databases. Run `pg_dump` first if you want the data.
