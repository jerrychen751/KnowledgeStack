# Order tables (ord_hdr, ord_ln)

Owner: Order Management Systems
Source: Vantera ERP, nightly extract
Last reviewed: 2026-04-02

An order is one header row in `ord_hdr` and one or more line rows in `ord_ln`.
The header carries the commercial terms. Each line carries one part number.

## Joining the tables

The extract carries no foreign key constraints. The ERP enforces referential
integrity upstream, and the extract drops constraints so the nightly load can run
the tables in parallel. The join columns are still indexed.

The join paths are:

- `ord_hdr.cust_id` to `cust_mstr.cust_id`
- `ord_ln.ord_id` to `ord_hdr.ord_id`
- `ord_ln.part_no` to `part_mstr.part_no`

`ord_ln` has a composite primary key of `ord_id` and `ln_no`. `ln_no` restarts at 1
for every order, so it is never unique on its own.

## Order status (ord_stat_cd)

Two characters. An order moves forward through these values and never moves back,
except into `CN`.

| ord_stat_cd | Meaning |
|---|---|
| `OP` | Open. Accepted, not yet shipped. |
| `BO` | Backorder. Accepted, waiting on fab or assembly capacity. |
| `SH` | Shipped. Goods left the dock. |
| `IV` | Invoiced. Shipped and billed. |
| `CN` | Cancelled. |

`SH` and `IV` are the only statuses that represent goods delivered. `OP` and `BO`
are demand, not revenue. `CN` orders keep their header and line rows, and their
`tot_amt` keeps the value the order would have had, so a query that forgets to
exclude `CN` overstates every total it produces.

Long backorders are normal in this business. A `BO` row with a lead time of 26 weeks
is not an error.

## Ship date (shp_dt)

`ord_ln.shp_dt` is set per line, because lines on one order can ship separately.
It is `NULL` for any line whose order is `OP`, `BO` or `CN`. Use `shp_dt` when the
question is about delivery. Use `ord_hdr.ord_dt` when the question is about bookings.

## Customer purchase order (po_ref)

`ord_hdr.po_ref` is the customer's own reference, copied from their purchase order.
The format is whatever that customer's system produces, so it is not parseable and
is not unique across customers.

## Related pages

- [Customer master](customer-master.md)
- [Amounts and units](amounts-and-units.md)
- [Revenue reporting](revenue-reporting.md)
