Tools & Technologies Used:

- Frontend: React, Next.js
- Backend: Node, Express, Nest.js
- RAG Agent with Text-to-SQL capabilities, which an MCP server or a web interface exposes

Motivation:

- At companies, each team keeps its knowledge in its own design docs and scratch workspaces. This project builds one RAG agent that reads all of them.
- The core features include retrieval augmented generation with citations, database + documentation connectors, and Text-to-SQL capabilities for analysts to obtain answers to their queries quickly.

Browser sends /api/... requests to the web server on port 3000. The web server forwards it to the backend API server on port 3001.

Getting Started with Local Development:

1. Install package dependencies.
```
cd /Users/jerry/coding/KnowledgeStack
pnpm install --frozen-lockfile
```

2. Start up the app databases with Docker. There is one main application database and another for a mock tenant (business database). They occupy ports 5432 and 5433 respectively.
```
pnpm dev:db
```

3. Generate the Prisma client and apply any pending migrations to the SQL.
```
pnpm prisma:generate
pnpm prisma:migrate:deploy
```

4. Start the API and the web app. These run locally on your own computer's network namespace (not in Docker) and occupy ports 3001 and 3000 respectively. If using Docker fully, uses the command `pnpm dev:full` which places these processes in Docker containers in addition to the databases (same ports).
```
pnpm dev
```

External Dependencies:
- Google OAuth
- Notion, Confluence

Notes / Clarifications:

- We use an API, not an MCP server, to obtain information from the sites and the services we connect to. For example, when we read documentation from Notion or Confluence, we use their API. Our agent does not use their MCP servers.
- We write the core tools that our web UI chatbot uses. Then we write an adapter, a wrapper for the MCP SDK, so that any AI client can call them.
- We have one internal Postgres DB where we store the vector indices for documents and the chat history. Then we open N read-only connections to the other databases that hold the business data we query.

User Story:

A user registers and obtains a workspace. In that workspace the user connects databases and authenticates against external documentation sources, such as Notion and Confluence, through OAuth.

- workspace system, where 1 or more users can connect 1 or more databases which our agent can execute safe queries against
- the smallest version is the workspace named "SEED", where we use seed-data/ to generate the starter data (a few tables for a single database)
- a query is "safe" because we wrap each agent query in a read-only transaction, with a user-configurable row limit
- give the agent a tool that reads the db\_connections table of one workspace. The tool lists each table with the description of that table.
- OAuth authentication for the web app and the MCP server

### Vocabulary

One thing carries one name, from the Postgres column to the button label.

| Term | Means | Never |
|---|---|---|
| workspace | The container that owns sources, documents and members. `workspaces`, `workspace_memberships`, `workspace_id`. | tenant |
| source | One connected system a workspace reads. `sources`, `documents.source_id`, `SourceProvider`. | document source |
| chunk | One embedded piece of a document. `document_chunks`, `chunk_index`. | passage |
| sync | The source-level pass that lists, embeds and deletes. `POST /sources/:sourceId/sync`, `last_synced_at`. | index, re-index |
| index | Writing the chunks of one document. `last_indexed_at`, `reindexDocument`. | sync |
| citation | A retrieved chunk shown beside the answer. | evidence |
| document | A page or a file of a source. The search tool is `search_documents`. | doc |
| tenant | The demo company database alone: the `tenant-db` container, `TENANT_POSTGRES_*` and `seed-data/tenant_company/`. | a workspace |

A per-provider file is named `<provider>.<role>.ts`, such as `notion.connector.ts` and `notion.oauth.ts`. A file shared by every provider is named `connector.<role>.ts`.

### Database Design

##### Internal Application Database

###### workspaces

- id
- name
- join\_code (the code a member gives to a new person)
- ...

###### users

- id
- external\_id (the Google `sub` claim, which never changes)
- external\_email
- external\_display\_name
- external\_image\_url
- ...

###### workspace\_memberships

- workspace\_id
- user\_id
- created\_at

###### user\_sessions

- id
- token\_hash (SHA-256 of the cookie value; the plaintext token never reaches Postgres)
- active\_workspace\_id (the workspace this browser reads)
- expires\_at
- user\_id

###### db\_connections

- workspace\_id
- dialect (one of a few possibilities, 'postgres', 'mysql')
- database
- host
- port
- username
- encrypted\_password
- created\_at
- ...

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
test -e apps/web/.env || cp apps/web/.env.example apps/web/.env
```

Fill the six root database values and both API database URLs.  
The API uses the host `127.0.0.1` and the port `3001` when those values stay blank.  
Set `API_INTERNAL_URL` to `http://127.0.0.1:3001` for the native path.  
Set `OPENAI_API_KEY` before the API calls OpenAI.  
Set `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` and `GOOGLE_REDIRECT_URI` before anyone signs in. Create an OAuth 2.0 client of type Web application at <https://console.cloud.google.com/apis/credentials>. Register `http://127.0.0.1:3001/auth/google/callback` as an authorized redirect URI on that client.  
Open the web app at `http://127.0.0.1:3000`, not at `localhost:3000`. The API sets the session cookie for the host `127.0.0.1`, and a browser sends a cookie to one host name only.

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

## Demo flow

Every page needs a Google account. `/signin` sends the browser to Google, and the callback opens a session cookie that lasts 30 days.

`/workspaces` picks the workspace the browser reads. Create one, or type the eight-character code a member gave you. A workspace holds its own sources, documents and chunks, and a question reads the open workspace and no other. The seeded demo workspace keeps its documents, and `SELECT name, join_code FROM workspaces;` reads the code that joins it.

`/sources` adds documents. Drag the files in `seed-data/wiki/` onto the page. The API writes them into `UPLOAD_ROOT`, which defaults to `apps/api/.uploads`, then cuts each file into chunks, embeds every chunk, and stores the vectors in `document_chunks`. The page lists each document with its chunk count. `Sync` runs the pass again, and it deletes the rows of a file that no longer exists.

Each workspace indexes its own upload directory, `UPLOAD_ROOT/<workspace id>`, so a file of one workspace never reaches the answers of another.

The Notion card stays disabled until `NOTION_CLIENT_ID`, `NOTION_CLIENT_SECRET` and `NOTION_REDIRECT_URI` hold values. Register `http://127.0.0.1:3001/sources/oauth/callback` as the redirect URI on the integration. The Confluence card stays disabled because a Confluence source reads one space and no space picker exists yet.

`/` asks a question. The chat model reaches the index through one tool, `search_documents`, which embeds the question and ranks every chunk of the workspace by cosine distance. The answer marks each chunk it used as `[n]`, and the citations rail beside it shows that chunk, its heading path and its cosine similarity. A click on `[n]` opens the chunk the sentence came from.

The menu under the question box picks the model that writes the answer. `chat/chat.service.ts` holds the three choices, and the first one, `gpt-5.6-luna`, answers a request that names no model.

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
agent/ - The loop that calls the model and the tools
mcp/
- Protocol endpoint; takes in via stdio or streamable HTTP

Write to app-db: connectors/ -> ingest -> app-db
Read from app-db: agent/ or mcp/ -> tools/ -> app-db, tenant-db

Vision:
- A user, such as a company, authenticates a documentation source, such as Notion or Confluence, through OAuth. We then process the documents on a schedule, and each pass reads only the content that changed.
- We store only the vector embeddings of a document, not the document itself. A query ranks the embeddings and returns the most relevant documents. The agent then opens Notion or Confluence and reads the full document when it needs the full text.
- The text-to-SQL agent reads the schemas of the connected databases. It also reads the related documentation from the vector store. It writes a SQL query from the schemas, the documentation and the prompt of the user. The web UI shows that query in an editable preview, and one click runs it.

Open questions:
- Where do we read the documentation from? How do we build the RAG agent? How do we create the index store?
- How do we sync the vector index database on a schedule? A pass deletes the row of a document the search no longer finds, updates the row of a document whose text changed, and adds a row for each new document.
- How do we build the agent loop with the OpenAI API?
