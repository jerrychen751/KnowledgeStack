# seed-data

Two subtrees that feed two different systems.

## `tenant_company/`

SQL for the `tenant-db` container. `docker-compose.yml` bind-mounts this folder at
`/docker-entrypoint-initdb.d`, and the Postgres image runs every `.sql` file in glob order
the first time the data volume is empty. Files are zero-padded because glob order is text
order, and because `03` depends on tables that `01` creates.

Editing a file changes nothing until the volume is reset:

The next commands delete all data in the local volume for the tenant database.
Inspect the first command output. Then replace `VOLUME_NAME_FROM_THE_PREVIOUS_COMMAND` with the exact volume name.
Docker cannot recover the volume after the delete command.

```
docker compose rm -s -f tenant-db
docker volume ls --filter label=com.docker.compose.volume=tenant-db-data
docker volume rm VOLUME_NAME_FROM_THE_PREVIOUS_COMMAND
docker compose up -d --wait tenant-db
```

The read-only role created by `03_readonly_role.sql` is `agent_readonly` /
`agent_readonly_local`. Those values belong in the `db_connections` row that a future app seed creates
for this tenant.

## `wiki/`

Markdown that a future ingest pipeline will read, embed, and write into the app database.
Docker never sees it. These pages are the only place the codes, units and join paths
in `tenant_company/` are explained, so an agent that skips retrieval answers wrong.

## The data

A fictional analog and embedded semiconductor supplier, Vantera Semiconductor: 36 parts,
32 customers, 60 orders, 124 order lines, covering 2025-01 through 2026-06.
