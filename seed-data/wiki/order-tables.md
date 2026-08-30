# Order tables (ord_hdr, ord_ln, ord_cmt)

Owner: Order Management Systems
Source: Vantera ERP, nightly extract
Last reviewed: 2026-06-30

An order is one header row in `ord_hdr` and one or more line rows in `ord_ln`.
The header carries the commercial terms. Each line carries one part number.

## Joining the tables

The extract carries no foreign key constraints. The ERP enforces referential
integrity upstream, and the extract drops constraints so the nightly load can run
the tables in parallel. The join columns are still indexed.

The join paths are:

- `ord_hdr.cust_id` to `cust_mstr.cust_id`
- `ord_hdr.rep_emp_id` to `emp_mstr.emp_id`
- `ord_hdr.terms_cd` to `pay_terms.terms_cd`
- `ord_hdr.shp_to_seq` to `cust_addr.addr_seq`, with `cust_id` as well
- `ord_hdr.bil_to_seq` to `cust_addr.addr_seq`, with `cust_id` as well
- `ord_ln.ord_id` to `ord_hdr.ord_id`
- `ord_ln.part_no` to `part_mstr.part_no`
- `ord_cmt.ord_id` to `ord_hdr.ord_id`

`ord_ln` has a composite primary key of `ord_id` and `ln_no`. `ln_no` restarts at 1
for every order, so it is never unique on its own. `shpmt_ln` and `invc_ln` point
back at one order line with the pair `ord_id` and `ln_no`, never with `ln_no` alone.

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

`code_lkp` lists a sixth value, `PN` for pending credit review. Vantera retired that
status in 2019 and no order carries it.

## Order type (ord_typ_cd)

Two characters. `ord_typ_cd` is new beside `ord_stat_cd` and it changes what a row
means.

| ord_typ_cd | Meaning |
|---|---|
| `ST` | Standard order. Goods sold at a price. |
| `SA` | Sample order. Goods sent free for evaluation. |
| `RM` | Return material. Goods coming back from the customer. |
| `EV` | Evaluation board order. Retired in 2021, no order carries it. |

A sample order carries `unit_px = 0` on every line, so it adds nothing to a revenue
sum. It still adds an order to an order count and a customer to a customer count.
Exclude `ord_typ_cd = 'SA'` from any count of orders won or customers served.

A return order carries a negative `qty`, so its `tot_amt` is negative and it reduces
a revenue sum. That is the intended behaviour. See [Returns and RMA](returns-and-rma.md).

Filter with `ord_typ_cd <> 'SA'` whenever the question is about what Vantera sold.
That keeps returns, which net revenue down, and drops samples, which are free.

## Line status (ln_stat_cd)

Two characters. The line status follows the header status, with one extra value.

| ln_stat_cd | Meaning |
|---|---|
| `OP` | Open. |
| `BO` | Backorder. |
| `SH` | Shipped complete. The whole ordered quantity left the dock. |
| `PS` | Partially shipped. Part of the quantity left, the rest is still open. |
| `CN` | Cancelled. |

A `PS` line sits on a header whose status is `SH` or `IV`, because the header moves
as soon as any line ships. An order with a `PS` line was invoiced for less than its
`tot_amt`. See [Shipping and invoicing](shipping-and-invoicing.md).

## Cancelled quantity (canc_qty)

`ord_ln.canc_qty` is the number of pieces the customer removed from the line after
Vantera accepted it. On a cancelled order it equals `qty`, because the whole line
went. On a live backorder it is the part the customer trimmed while waiting.

`qty` is never reduced when `canc_qty` rises. The open quantity is
`qty - canc_qty - the quantity already shipped`.

## Dates

| Column | Meaning |
|---|---|
| `ord_hdr.ord_dt` | The day Vantera accepted the order. Use it for bookings. |
| `ord_hdr.req_dt` | The day the customer asked to receive the goods. |
| `ord_ln.sched_dt` | The day Vantera promised the line. |
| `ord_ln.shp_dt` | The day the line left the dock. |

`sched_dt` is set at order entry from `part_mstr.lt_wks`, and the load overwrites it
with the actual ship date once the line ships. It is `NULL` on a cancelled line.

`ord_ln.shp_dt` is set per line, because lines on one order can ship separately. It
is `NULL` for any line whose order is `OP`, `BO` or `CN`. Use `shp_dt` when the
question is about delivery. Use `ord_hdr.ord_dt` when the question is about bookings.

A line that shipped late has `shp_dt > req_dt`. That comparison is the only
delivery-performance measure the extract supports, and it needs both dates on the
same row, so it joins `ord_ln` to `ord_hdr`.

## Sales representative (rep_emp_id)

`ord_hdr.rep_emp_id` is the representative who booked the order, stamped at order
entry and never changed afterwards. It answers "who booked it".

It is not always the representative who owns the account today. Use
`cust_terr_asgn` when the question is about territory ownership. See
[Sales territories](sales-territories.md).

## Customer purchase order (po_ref)

`ord_hdr.po_ref` is the customer's own reference, copied from their purchase order.
The format is whatever that customer's system produces, so it is not parseable and
is not unique across customers.

## Comments (ord_cmt)

`ord_cmt` holds free text, keyed by `ord_id` and `cmt_seq`. `cmt_txt` is capped at 72
characters, so a long note runs over several rows and one sentence can break across
two rows. Read a whole comment with an ordered aggregate:

```sql
SELECT ord_id, cmt_typ_cd, string_agg(cmt_txt, ' ' ORDER BY cmt_seq) AS note
FROM ord_cmt
GROUP BY ord_id, cmt_typ_cd;
```

| cmt_typ_cd | Meaning |
|---|---|
| `IN` | Internal. Never printed and never shown to the customer. |
| `EX` | External. Printed on the packing list. |

An `IN` comment is where order management records the reason an order was cancelled
or released. It is the only place the extract carries that reason.

## Related pages

- [Table directory](table-directory.md)
- [Customer master](customer-master.md)
- [Amounts and units](amounts-and-units.md)
- [Shipping and invoicing](shipping-and-invoicing.md)
- [Revenue reporting](revenue-reporting.md)
