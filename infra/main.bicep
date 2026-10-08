// Every Azure resource of the deployment. docs/azure.md explains each one and gives the command that applies this file.

param location string = resourceGroup().location
// The commit SHA that the publish job in .github/workflows/ci.yml tagged the three images with.
param imageTag string

@secure()
param postgresAdminPassword string
@secure()
param tokenEncryptionKey string
@secure()
param openaiApiKey string
param googleClientId string
@secure()
param googleClientSecret string
param notionClientId string = ''
@secure()
param notionClientSecret string = ''
param confluenceClientId string = ''
@secure()
param confluenceClientSecret string = ''

var registry = 'ghcr.io/jerrychen751/knowledgestack'
var postgresAdminLogin = 'ksadmin'
var appDatabaseName = 'knowledgestack'
var appDatabaseUrl = 'postgresql://${postgresAdminLogin}:${postgresAdminPassword}@${postgres.properties.fullyQualifiedDomainName}:5432/${appDatabaseName}?schema=public'
// Azure builds every app address from the app name and this domain, so both URLs are known before either app exists.
var webAppUrl = 'https://web.${environment.properties.defaultDomain}'
var apiUrl = 'https://api.${environment.properties.defaultDomain}'

resource logs 'Microsoft.OperationalInsights/workspaces@2023-09-01' = {
  name: 'log-knowledgestack'
  location: location
  properties: {
    sku: { name: 'PerGB2018' }
    retentionInDays: 30
  }
}

resource environment 'Microsoft.App/managedEnvironments@2026-07-01' = {
  name: 'cae-knowledgestack'
  location: location
  properties: {
    // With no mode stated, Azure created an Express environment on 2026-10-08, and Express cannot run a job such as api-migrate.
    environmentMode: 'WorkloadProfiles'
    workloadProfiles: [
      { name: 'Consumption', workloadProfileType: 'Consumption' }
    ]
    appLogsConfiguration: {
      destination: 'log-analytics'
      logAnalyticsConfiguration: {
        customerId: logs.properties.customerId
        sharedKey: logs.listKeys().primarySharedKey
      }
    }
  }
}

resource postgres 'Microsoft.DBforPostgreSQL/flexibleServers@2024-08-01' = {
  // A server name is unique across all of Azure, so the name carries a hash of the resource group.
  name: 'psql-knowledgestack-${uniqueString(resourceGroup().id)}'
  location: location
  sku: { name: 'Standard_B1ms', tier: 'Burstable' }
  properties: {
    version: '17'
    administratorLogin: postgresAdminLogin
    administratorLoginPassword: postgresAdminPassword
    // The student offer covers 32 GB. Auto-grow would raise the disk past it without asking.
    storage: { storageSizeGB: 32, autoGrow: 'Disabled' }
    backup: { backupRetentionDays: 7, geoRedundantBackup: 'Disabled' }
    highAvailability: { mode: 'Disabled' }
    network: { publicNetworkAccess: 'Enabled' }
  }

  // The server accepts one change at a time, so each child below waits for the one before it.

  // Without VECTOR on this list, CREATE EXTENSION "vector" in migration 20260811185206 fails.
  resource allowedExtensions 'configurations' = {
    name: 'azure.extensions'
    properties: { value: 'VECTOR', source: 'user-override' }
  }

  resource appDatabase 'databases' = {
    name: appDatabaseName
    dependsOn: [allowedExtensions]
  }

  resource tenantDatabase 'databases' = {
    name: 'tenant_company'
    dependsOn: [appDatabase]
  }

  // Azure reads the range 0.0.0.0 to 0.0.0.0 as every address inside Azure. The apps have no fixed outbound address to name instead.
  resource allowAzureServices 'firewallRules' = {
    name: 'AllowAllAzureServicesAndResourcesWithinAzureIps'
    properties: { startIpAddress: '0.0.0.0', endIpAddress: '0.0.0.0' }
    dependsOn: [tenantDatabase]
  }
}

resource apiMigrate 'Microsoft.App/jobs@2024-03-01' = {
  name: 'api-migrate'
  location: location
  properties: {
    environmentId: environment.id
    configuration: {
      triggerType: 'Manual'
      replicaTimeout: 300
      replicaRetryLimit: 0
      manualTriggerConfig: { parallelism: 1, replicaCompletionCount: 1 }
      secrets: [
        // The Prisma CLI parses this URL itself and accepts require. The pg driver in the API needs verify-full.
        { name: 'db-direct-url', value: '${appDatabaseUrl}&sslmode=require' }
      ]
    }
    template: {
      containers: [
        {
          name: 'api-migrate'
          image: '${registry}-api-migrate:${imageTag}'
          resources: { cpu: json('0.5'), memory: '1Gi' }
          env: [
            { name: 'DB_DIRECT_URL', secretRef: 'db-direct-url' }
          ]
        }
      ]
    }
  }
}

resource api 'Microsoft.App/containerApps@2024-03-01' = {
  name: 'api'
  location: location
  // The startup probe queries the app database, so the app waits for the last child of the server above.
  dependsOn: [postgres::allowAzureServices]
  properties: {
    environmentId: environment.id
    configuration: {
      activeRevisionsMode: 'Single'
      // An MCP client posts to /mcp on this address directly, so the API is public.
      ingress: { external: true, targetPort: 3001, allowInsecure: false }
      // Azure rejects a secret with an empty value, so an unused connector adds no secret.
      secrets: concat(
        [
          { name: 'db-pool-url', value: '${appDatabaseUrl}&sslmode=verify-full' }
          { name: 'token-encryption-key', value: tokenEncryptionKey }
          { name: 'openai-api-key', value: openaiApiKey }
          { name: 'google-client-secret', value: googleClientSecret }
        ],
        empty(notionClientSecret) ? [] : [{ name: 'notion-client-secret', value: notionClientSecret }],
        empty(confluenceClientSecret) ? [] : [{ name: 'confluence-client-secret', value: confluenceClientSecret }]
      )
    }
    template: {
      containers: [
        {
          name: 'api'
          image: '${registry}-api:${imageTag}'
          resources: { cpu: json('0.5'), memory: '1Gi' }
          env: concat(
            [
              { name: 'DEPLOYMENT_NAME', value: 'production' }
              { name: 'LOG_LEVEL', value: 'log' }
              { name: 'WEB_APP_URL', value: webAppUrl }
              { name: 'MCP_PUBLIC_URL', value: apiUrl }
              { name: 'DB_POOL_URL', secretRef: 'db-pool-url' }
              { name: 'TOKEN_ENCRYPTION_KEY', secretRef: 'token-encryption-key' }
              { name: 'OPENAI_API_KEY', secretRef: 'openai-api-key' }
              { name: 'GOOGLE_CLIENT_ID', value: googleClientId }
              { name: 'GOOGLE_CLIENT_SECRET', secretRef: 'google-client-secret' }
            ],
            empty(notionClientSecret) ? [] : [
              { name: 'NOTION_CLIENT_ID', value: notionClientId }
              { name: 'NOTION_CLIENT_SECRET', secretRef: 'notion-client-secret' }
            ],
            empty(confluenceClientSecret) ? [] : [
              { name: 'CONFLUENCE_CLIENT_ID', value: confluenceClientId }
              { name: 'CONFLUENCE_CLIENT_SECRET', secretRef: 'confluence-client-secret' }
            ]
          )
          probes: [
            { type: 'Startup', httpGet: { path: '/health/ready', port: 3001 }, periodSeconds: 3, failureThreshold: 20 }
            { type: 'Liveness', httpGet: { path: '/health/live', port: 3001 }, periodSeconds: 30 }
          ]
        }
      ]
      // One replica holds at most 10 connections to the app database, and the B1ms server allows about 35.
      scale: { minReplicas: 0, maxReplicas: 1 }
    }
  }
}

resource web 'Microsoft.App/containerApps@2024-03-01' = {
  name: 'web'
  location: location
  properties: {
    environmentId: environment.id
    configuration: {
      activeRevisionsMode: 'Single'
      ingress: { external: true, targetPort: 3000, allowInsecure: false }
    }
    template: {
      containers: [
        {
          name: 'web'
          image: '${registry}-web:${imageTag}'
          resources: { cpu: json('0.25'), memory: '0.5Gi' }
          env: [
            // The API answers HTTPS only, and its certificate names this address, so the short name http://api is not used.
            { name: 'API_INTERNAL_URL', value: apiUrl }
          ]
          probes: [
            { type: 'Startup', httpGet: { path: '/health', port: 3000 }, periodSeconds: 3, failureThreshold: 20 }
            { type: 'Liveness', httpGet: { path: '/health', port: 3000 }, periodSeconds: 30 }
          ]
        }
      ]
      scale: { minReplicas: 0, maxReplicas: 1 }
    }
  }
}

// The deploy job in .github/workflows/ci.yml signs in as this identity. No password exists for it.
resource deployIdentity 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31' = {
  name: 'id-knowledgestack-deploy'
  location: location

  // Azure accepts a GitHub token only when it names this repository and this branch.
  resource githubMain 'federatedIdentityCredentials' = {
    name: 'github-main'
    properties: {
      issuer: 'https://token.actions.githubusercontent.com'
      subject: 'repo:jerrychen751/KnowledgeStack:ref:refs/heads/main'
      audiences: ['api://AzureADTokenExchange']
    }
  }
}

// The deploy job updates two apps and one job, so the identity holds only the two built-in roles for those: Container Apps Contributor, then Container Apps Jobs Contributor. Neither can read the Postgres server or delete it.
resource deployRoles 'Microsoft.Authorization/roleAssignments@2022-04-01' = [
  for roleId in ['358470bc-b998-42bd-ab17-a7e34c199c0f', '4e3d2b60-56ae-4dc6-a233-09c8e5a82e68']: {
    name: guid(resourceGroup().id, deployIdentity.id, roleId)
    properties: {
      principalId: deployIdentity.properties.principalId
      principalType: 'ServicePrincipal'
      roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', roleId)
    }
  }
]

output webAppUrl string = webAppUrl
output mcpUrl string = '${apiUrl}/mcp'
output postgresHost string = postgres.properties.fullyQualifiedDomainName
// The three values below go into the GitHub repository variables that switch the deploy job on.
output azureClientId string = deployIdentity.properties.clientId
output azureTenantId string = tenant().tenantId
output azureSubscriptionId string = subscription().subscriptionId
