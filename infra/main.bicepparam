using './main.bicep'

// Every value comes from the environment that scripts/apply-azure-infrastructure.mjs builds from the git-ignored infra/.env.
param imageTag = readEnvironmentVariable('IMAGE_TAG')
param postgresAdminPassword = readEnvironmentVariable('POSTGRES_ADMIN_PASSWORD')
param tokenEncryptionKey = readEnvironmentVariable('TOKEN_ENCRYPTION_KEY')
param openaiApiKey = readEnvironmentVariable('OPENAI_API_KEY')
param googleClientId = readEnvironmentVariable('GOOGLE_CLIENT_ID')
param googleClientSecret = readEnvironmentVariable('GOOGLE_CLIENT_SECRET')
param notionClientId = readEnvironmentVariable('NOTION_CLIENT_ID', '')
param notionClientSecret = readEnvironmentVariable('NOTION_CLIENT_SECRET', '')
param confluenceClientId = readEnvironmentVariable('CONFLUENCE_CLIENT_ID', '')
param confluenceClientSecret = readEnvironmentVariable('CONFLUENCE_CLIENT_SECRET', '')
