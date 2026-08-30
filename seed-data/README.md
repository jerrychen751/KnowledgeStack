# seed-data

Two subtrees that feed two different systems.

## `tenant_company/`

SQL for the `tenant-db` container. `docker-compose.yml` bind-mounts this folder at
`/docker-entrypoint-initdb.d`, and the Postgres image runs every `.sql` file in glob order
the first time the data volume is empty. Files are zero-padded because glob order is text
order, and because each file depends on the tables and rows the earlier files create.

| File | What it creates |
|---|---|
| `01_schema.sql` | The 24 tables and the indexes on the join columns. No constraint and no comment. |
| `02_reference_data.sql` | The code tables: `code_lkp`, `pay_terms`, `whs_mstr`, `pkg_mstr`, `emp_mstr`, `sls_terr`. |
| `03_master_data.sql` | Parts, customers, addresses, contacts, territory assignments and part cross-references. |
| `04_order_data.sql` | Order headers, order lines, order comments, RMAs and the legacy archive. |
| `05_derived_data.sql` | Everything the nightly load computes: prices, list prices, line status, order totals, lots, shipments, invoices and inventory snapshots. |
| `06_readonly_role.sql` | The `agent_readonly` role and its grants. |

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

The read-only role created by `06_readonly_role.sql` is `agent_readonly` /
`agent_readonly_local`. Those values belong in the `database_connections` row that a future app seed creates
for this tenant.

## `wiki/`

Markdown that a future ingest pipeline will read, embed, and write into the app database.
Docker never sees it. These pages are the only place the codes, units and join paths
in `tenant_company/` are explained, so an agent that skips retrieval answers wrong.

`table-directory.md` is the entry point. It names every table, its grain and the page
that documents it.

| Page | Covers |
|---|---|
| `table-directory.md` | Every table, the missing foreign keys, and the date columns. |
| `amounts-and-units.md` | The three money scales, basis points, and the whole-dollar archive column. |
| `customer-master.md` | Account type, status, deletion, region, corporate hierarchy, addresses, contacts. |
| `order-tables.md` | Order status, order type, line status, cancelled quantity, dates, comments. |
| `part-numbering.md` | Part numbers, family codes, packages, cost, qualification, cross-references. |
| `pricing-and-price-list.md` | Effective-dated contract prices, list price against net price. |
| `sales-territories.md` | Employees, territories, and the effective-dated assignment bridge. |
| `shipping-and-invoicing.md` | Partial shipments, split shipments, invoices, tax, payment. |
| `inventory-and-lots.md` | Snapshot balances, warehouses, production lots and yield. |
| `returns-and-rma.md` | The RMA, the return order and the credit memo. |
| `code-lookup.md` | What `code_lkp` covers and the four coded columns it does not. |
| `order-history-archive.md` | The pre-2025 archive, its scale and its orphan customers. |
| `revenue-reporting.md` | The five rules, the two revenue routes, margin and backlog. |

## The data

A fictional analog and embedded semiconductor supplier, Vantera Semiconductor.

| Table | Rows |
|---|---|
| `part_mstr` | 62 |
| `cust_mstr` | 50 |
| `cust_addr` | 114 |
| `cust_ctct` | 68 |
| `cust_terr_asgn` | 61 |
| `part_xref` | 32 |
| `price_lst` | 191 |
| `ord_hdr` | 103 |
| `ord_ln` | 212 |
| `ord_cmt` | 30 |
| `shpmt_hdr` | 89 |
| `shpmt_ln` | 183 |
| `invc_hdr` | 78 |
| `invc_ln` | 157 |
| `rma_hdr` | 7 |
| `lot_mstr` | 248 |
| `inv_bal` | 1488 |
| `ord_hdr_hist` | 184 |
| `code_lkp` | 66 |
| `emp_mstr` | 18 |
| `sls_terr` | 12 |
| `whs_mstr` | 7 |
| `pkg_mstr` | 28 |
| `pay_terms` | 9 |

`ord_hdr` covers 2025-01-14 through 2026-06-30. `ord_hdr_hist` covers 2022-01-06
through 2024-12-17 in a different layout and a different scale.

## What the fixture tests

Every trap below is real in the data, and only the wiki resolves it. An agent that
writes SQL without retrieval gets a plausible number that is wrong.

| The trap | What goes wrong |
|---|---|
| `unit_px` is hundredths of a cent, `tot_amt` is cents | A price 100 times too high. |
| `ord_hdr_hist.tot_amt_usd` is whole dollars | A pre-2025 year 100 times too low. |
| `CN` orders keep `tot_amt` | Every total overstated. |
| `cst_typ_cd = '04'` is intercompany | Revenue double counted. |
| `del_flg = 'Y'` rows survive | Merged accounts counted twice. |
| `stat_cd = 'H'` is an active customer | Real revenue dropped. |
| `ord_typ_cd = 'SA'` is a free sample | Order and customer counts inflated. |
| `ord_typ_cd = 'RM'` carries a negative quantity | Returns dropped or double counted. |
| `inv_bal` is a monthly snapshot | Stock six times too high. |
| `cust_addr` needs `cust_id` and `addr_seq` | Every order row multiplied. |
| `cust_terr_asgn` is effective dated | Revenue credited to the wrong representative. |
| `price_lst` is effective dated | A discount that nobody gave. |
| `code_lkp` needs `cd_typ` in the join | `OP` matches three code families. |
| `code_lkp` has no `fam_cd` family | No family name anywhere but the wiki. |
| A shipment can be short or split | Invoiced value below the order value. |
| `invc_typ_cd = 'IN'` drops credit memos | Gross billings reported as net revenue. |
| `tax_amt` sits outside `invc_amt` | Receivables understated. |
| `emp_mstr.term_dt` marks a leaver | Their historical orders dropped. |
| `lot_mstr` scrapped lots store zero yield | Family yield pulled down. |
| Four `ord_hdr_hist.cust_no` values have no customer | An inner join drops them silently. |
