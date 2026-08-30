# Table directory

Owner: Data Governance
Source: Vantera ERP, nightly extract
Last reviewed: 2026-06-30

The extract holds 24 tables. No table and no column carries a database comment,
because the nightly load drops them. This wiki is the only documentation.

Read the page named in the last column before you write a query against a table.

## Reference tables

| Table | One row is | Documented in |
|---|---|---|
| `code_lkp` | one value of one code type | [Code lookup](code-lookup.md) |
| `pay_terms` | one payment terms code | [Customer master](customer-master.md) |
| `whs_mstr` | one warehouse | [Inventory and lots](inventory-and-lots.md) |
| `pkg_mstr` | one package code | [Part numbering](part-numbering.md) |
| `emp_mstr` | one Vantera employee | [Sales territories](sales-territories.md) |
| `sls_terr` | one sales territory | [Sales territories](sales-territories.md) |

## Master tables

| Table | One row is | Documented in |
|---|---|---|
| `part_mstr` | one orderable part number | [Part numbering](part-numbering.md) |
| `part_xref` | one customer part number for one customer | [Part numbering](part-numbering.md) |
| `cust_mstr` | one sold-to account | [Customer master](customer-master.md) |
| `cust_addr` | one address of one account | [Customer master](customer-master.md) |
| `cust_ctct` | one contact person at one account | [Customer master](customer-master.md) |
| `cust_terr_asgn` | one account in one territory over one date range | [Sales territories](sales-territories.md) |
| `price_lst` | one contract price for one account and part over one date range | [Pricing and the price list](pricing-and-price-list.md) |

## Transaction tables

| Table | One row is | Documented in |
|---|---|---|
| `ord_hdr` | one order | [Order tables](order-tables.md) |
| `ord_ln` | one part on one order | [Order tables](order-tables.md) |
| `ord_cmt` | one 72 character comment line on one order | [Order tables](order-tables.md) |
| `shpmt_hdr` | one shipment that left one warehouse | [Shipping and invoicing](shipping-and-invoicing.md) |
| `shpmt_ln` | one order line inside one shipment | [Shipping and invoicing](shipping-and-invoicing.md) |
| `invc_hdr` | one invoice or one credit memo | [Shipping and invoicing](shipping-and-invoicing.md) |
| `invc_ln` | one billed line on one invoice | [Shipping and invoicing](shipping-and-invoicing.md) |
| `rma_hdr` | one return material authorization | [Returns and RMA](returns-and-rma.md) |

## Supply tables

| Table | One row is | Documented in |
|---|---|---|
| `lot_mstr` | one production lot | [Inventory and lots](inventory-and-lots.md) |
| `inv_bal` | the stock of one part in one warehouse at one month end | [Inventory and lots](inventory-and-lots.md) |

## Archive table

| Table | One row is | Documented in |
|---|---|---|
| `ord_hdr_hist` | one order closed before 2025 | [Order history archive](order-history-archive.md) |

## The extract carries no foreign keys

The ERP enforces referential integrity upstream. The nightly load drops every
constraint so it can write the tables in parallel, and it recreates only the indexes.
`information_schema` therefore exposes no join path at all. Every join path in this
wiki is a rule that the data obeys, not a rule the database enforces.

Three consequences follow.

- A join column can hold a value that the parent table does not hold. This is real in
  `ord_hdr_hist.cust_no`. See [Order history archive](order-history-archive.md).
- A cascade delete never happens. A deleted customer keeps its orders.
- A query planner cannot use a key to remove a redundant join, so an unfiltered join
  to `cust_addr` multiplies rows. See [Customer master](customer-master.md).

## The three date columns that are easy to confuse

| Column | Meaning | Use it for |
|---|---|---|
| `ord_hdr.ord_dt` | the day Vantera accepted the order | bookings |
| `ord_hdr.req_dt` | the day the customer asked to receive the goods | delivery performance |
| `ord_ln.sched_dt` | the day Vantera promised the line | delivery performance |
| `ord_ln.shp_dt` | the day the line left the dock | shipment reporting |
| `invc_hdr.invc_dt` | the day Finance billed the shipment | invoiced revenue |

## Related pages

- [Revenue reporting](revenue-reporting.md)
- [Amounts and units](amounts-and-units.md)
