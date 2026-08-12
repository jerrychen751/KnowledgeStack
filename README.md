Tools & Technologies Used:

*   Frontend: React, Next.js
*   Backend: Node, Express, Nest.js
*   RAG Agent with Text-to-SQL capabilities, exposed via MCP server or web interface

Motivation:

*   At companies, knowledge is often siloed within teams, scattered across design docs and scratch workspaces within teams. This project explores a unified RAG agent that tackles this problem.
*   The core features include retrieval augmented generation with citations, database + documentation connectors, and Text-to-SQL capabilities for analysts to obtain answers to their queries quickly.

Project Scope:

*   We initially point at seed data which can be automatically regenerated from `seed-data/`.

Notes / Clarifications:

*   We use API, not MCP server, to obtain information from sites/services we connect to. For example, when retrieving documentation from Notion / Confluence, we use their API. Our agent does not use their MCP servers.
*   We write core tools that our web UI chatbot uses. And then write an adapter (wrapper for MCP SDK) so any AI client can call them.
*   We have one internal Postgres DB where we store vector indices for documents and chat history. Then N number of read-only connections to other databases holding business data that we perform SQL queries on.

User Story:

A user will register and obtain a workspace where they can connect their databases and authenticate against external documentation sources such as Notion and Confluence through OAuth.

*   tenant system, where 1 or more users can connect 1 or more databases which our agent can execute safe queries against
*   smallest / simplest version is tenant name "SEED" where we use seed-data/ to generate starter data (a few tables for a single database)
*   queries are "safe" in that we wrap each agent query in a read-only transaction, with a user-configurable limit on rows for querying
*   for agent to know which database to use, give it a tool that looks at database\_connections table for a specific tenant and lists out table w/ description of table etc
*   authentication for web app + MCP server (oauth)

### Database Design

##### Internal Application Database

###### tenants

*   id
*   name
*   ...

###### db\_connections

*   tenant\_id
*   database (one of a few possibilities, 'postgres', 'mysql')
*   host
*   port
*   username
*   enc\_password
*   created\_at
*   ...

## Local development

Use Node.js 24, pnpm 11.10.0, and Docker Desktop.

Install the workspace dependencies:

```
pnpm install --frozen-lockfile
```

Copy each template only when its target file does not exist:

```
test -e .env || cp .env.example .env
test -e apps/api/.env || cp apps/api/.env.example apps/api/.env
test -e apps/web/.env.local || cp apps/web/.env.example apps/web/.env.local
```

Fill the six root database values and both API database URLs.  
The API uses host `127.0.0.1` and port `3001` when those values stay blank.  
Set `API_INTERNAL_URL` to `http://127.0.0.1:3001` for the native path.  
Set `OPENAI_API_KEY` before the API calls OpenAI.

Move any current `DB_POOL_URL`, `DB_DIRECT_URL`, and `OPENAI_API_KEY` values from the root file into `apps/api/.env`.

For the fast native path, start the databases first:

```
pnpm dev:db
pnpm prisma:generate
pnpm prisma:migrate:deploy
pnpm dev
```

`pnpm dev` is an alias for `pnpm dev:apps`.

The web app uses `http://127.0.0.1:3000`. The API uses `http://127.0.0.1:3001`.

For the full container path, start every service through Compose:

```
pnpm dev:full
```

Compose applies the app database migrations before it starts the API.

Stop the services and keep the database data:

```
pnpm docker:down
```

sync/
- connector.resolver.ts
- sync.service.ts
- sync.scheduler.ts
...
auth/
- oauth/
    - xxx.oauth.ts
- token.service.ts
connectors/
- connector.factory.ts
- connector.types.ts
- xxx.connector.ts
tools/
- tools.types.ts
- tools.registry.ts
- xxx.tool.ts
agent/ - The "harness" loop
mcp/
- Protocol endpoint; takes in via stdio or streamable HTTP

Write to app-db: connectors/ -> ingest -> app-db
Read from app-db: agent/ or mcp/ -> tools/ -> app-db, tenant-db

Vision:
- Users, such as companies, are able to authenticate documentation, such as Notion or Confluence, through OAuth. Next, we are able to incrementally process and kind of checkpoint. Or, well, either we process them as a patch on a schedule, or we try to only give incremental updates based on content from these connected services, such as Notion and Confluence.
- As we process these documents, we primarily want to store vector embeddings in our vector database. And I don't think we want to store the whole document ourselves. We want to make it so that once we have a query, we can find a list of the most relevant documents and files, and then point the agent to go explore again and read that file in its entirety by connecting to Notion or Confluence. Instead of storing the whole thing in our database, we basically want to almost have an index so that the agent can search and read the full document if it needs to, instead of reading it and storing it up front in our own database.
- The other part, which is the text-to-SQL agent portion, should be able to read the schemas of databases that it's connected to, as well as pull any relevant documentation if it finds it from the vector store, and use those together to generate SQL queries depending on the user's prompt. It should be able to provide an outline of the SQL query in an editable mode as a preview, and then be able to execute upon a click.

Details to Sort Out:
- Where do we take in documentation? How to build the RAG agent? How to we create an index store?
- How to periodically sync vector index database? Maybe self-cleaning? Like if we search for something and it's not found remove from database? Or if it's found but text is different update. And then periodic add new ones.
- How to build agent "harness" loop using openai api?
