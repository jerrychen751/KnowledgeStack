# Order tables (ord_hdr, ord_ln, ord_cmt)

Owner: Order Management Systems (Dan Whitfield)
Source: Vantera ERP, nightly extract
Last reviewed: 2026-06-30

An order is one header row in `ord_hdr` and one or more line rows in `ord_ln`. The
header carries the commercial terms. Each line carries one part number. That is the
whole model, and almost everything confusing about these tables comes from what the
extract leaves out rather than what it holds.

## Joining the tables

First thing to know: the extract carries no foreign key constraints. None. The ERP
enforces referential integrity upstream, and the extract drops the constraints so the
nightly load can run the tables in parallel. The join columns are still indexed, so
performance is fine, but your query is the only thing checking that a join makes
sense.

The join paths are:

- `ord_hdr.cust_id` to `cust_mstr.cust_id`
- `ord_hdr.rep_emp_id` to `emp_mstr.emp_id`
- `ord_hdr.terms_cd` to `pay_terms.terms_cd`
- `ord_hdr.shp_to_seq` to `cust_addr.addr_seq`, with `cust_id` as well
- `ord_hdr.bil_to_seq` to `cust_addr.addr_seq`, with `cust_id` as well
- `ord_ln.ord_id` to `ord_hdr.ord_id`
- `ord_ln.part_no` to `part_mstr.part_no`
- `ord_cmt.ord_id` to `ord_hdr.ord_id`

Note the two address joins. They need `cust_id` as well as the sequence number, and
leaving `cust_id` out is the classic way to multiply your row count by a factor
nobody can explain later.

`ord_ln` has a composite primary key of `ord_id` and `ln_no`. `ln_no` restarts at 1
for every order, so it is never unique on its own. `shpmt_ln` and `invc_ln` point
back at one order line with the pair `ord_id` and `ln_no`, never with `ln_no` alone.

## Order status (ord_stat_cd)

Two characters. An order moves forward through these values and never moves back,
with the one exception of dropping into `CN`.

| ord_stat_cd | Meaning |
|---|---|
| `OP` | Open. Accepted, not yet shipped. |
| `BO` | Backorder. Accepted, waiting on fab or assembly capacity. |
| `SH` | Shipped. Goods left the dock. |
| `IV` | Invoiced. Shipped and billed. |
| `CN` | Cancelled. |

`SH` and `IV` are the only statuses that represent goods delivered. `OP` and `BO`
are demand, not revenue.

`CN` deserves its own warning. Cancelled orders keep their header and line rows, and
`tot_amt` keeps the value the order would have had. Nothing is zeroed. A query that
forgets to exclude `CN` overstates every total it produces, and it will not look
obviously wrong.

Long backorders are normal in this business, so do not treat them as data quality
problems. A `BO` row with a lead time of 26 weeks is an ordinary Tuesday here.

One historical oddity: `code_lkp` lists a sixth value, `PN` for pending credit
review. Vantera retired that status in 2019 and no order carries it. The lookup row
was never cleaned up.

## Order type (ord_typ_cd)

Two characters. `ord_typ_cd` is a separate concept from `ord_stat_cd`, and it changes
what a row actually means, not just where it is in its lifecycle.

| ord_typ_cd | Meaning |
|---|---|
| `ST` | Standard order. Goods sold at a price. |
| `SA` | Sample order. Goods sent free for evaluation. |
| `RM` | Return material. Goods coming back from the customer. |
| `EV` | Evaluation board order. Retired in 2021, no order carries it. |

A sample order carries `unit_px = 0` on every line, so it adds nothing to a revenue
sum and people assume it is harmless. It is not. It still adds an order to an order
count and a customer to a customer count, which is how a design win report ends up
claiming customers who have never paid us anything. Exclude `ord_typ_cd = 'SA'` from
any count of orders won or customers served.

A return order carries a negative `qty`, so its `tot_amt` is negative and it reduces
a revenue sum. That is intended, not a bug. See
[Returns and RMA](returns-and-rma.md).

The rule of thumb: filter with `ord_typ_cd <> 'SA'` whenever the question is about
what Vantera sold. That single condition keeps returns, which net revenue down, and
drops samples, which are free.

## Line status (ln_stat_cd)

Two characters. The line status follows the header status, with one extra value.

| ln_stat_cd | Meaning |
|---|---|
| `OP` | Open. |
| `BO` | Backorder. |
| `SH` | Shipped complete. The whole ordered quantity left the dock. |
| `PS` | Partially shipped. Part of the quantity left, the rest is still open. |
| `CN` | Cancelled. |

`PS` is the value that surprises people. A `PS` line sits on a header whose status is
`SH` or `IV`, because the header moves as soon as *any* line ships. So an order can
read as shipped at the header while a line on it is still half open, and that order
was invoiced for less than its `tot_amt`. See
[Shipping and invoicing](shipping-and-invoicing.md).

## Cancelled quantity (canc_qty)

`ord_ln.canc_qty` is the number of pieces the customer removed from the line after
Vantera accepted it. On a cancelled order it equals `qty`, because the whole line
went. On a live backorder it is the part the customer trimmed while waiting, which
happens a lot when lead times stretch.

The trap here: `qty` is never reduced when `canc_qty` rises. Both stay. The open
quantity is `qty - canc_qty - the quantity already shipped`, and if you compute
backlog from `qty` alone you are counting pieces the customer already walked away
from.

## Dates

| Column | Meaning |
|---|---|
| `ord_hdr.ord_dt` | The day Vantera accepted the order. Use it for bookings. |
| `ord_hdr.req_dt` | The day the customer asked to receive the goods. |
| `ord_ln.sched_dt` | The day Vantera promised the line. |
| `ord_ln.shp_dt` | The day the line left the dock. |

`sched_dt` is set at order entry from `part_mstr.lt_wks`, and the load overwrites it
with the actual ship date once the line ships. So it means "promised" before the
shipment and "actual" after it, which is unfortunate but that is what it does. It is
`NULL` on a cancelled line.

`ord_ln.shp_dt` is set per line, because lines on one order can ship separately. It
is `NULL` for any line whose order is `OP`, `BO` or `CN`. Use `shp_dt` when the
question is about delivery, and `ord_hdr.ord_dt` when the question is about bookings.

A line that shipped late has `shp_dt > req_dt`. That comparison is the only
delivery-performance measure this extract supports. It needs both dates on the same
row, so it always joins `ord_ln` to `ord_hdr`.

## Sales representative (rep_emp_id)

`ord_hdr.rep_emp_id` is the representative who booked the order. It is stamped at
order entry and never changed afterwards, so it answers exactly one question: who
booked it.

It is not always the representative who owns the account today. Those are different
questions with different answers, and territory ownership lives in
`cust_terr_asgn`. See [Sales territories](sales-territories.md).

## Customer purchase order (po_ref)

`ord_hdr.po_ref` is the customer's own reference, copied from their purchase order
exactly as it arrived. The format is whatever that customer's system produces, so it
is not parseable and it is not unique across customers. Two customers using
`PO-0001` is not a data problem, it is just two customers.

## Comments (ord_cmt)

`ord_cmt` holds free text, keyed by `ord_id` and `cmt_seq`. `cmt_txt` is capped at 72
characters, a limit inherited from the green screen it was originally typed into. A
long note runs over several rows and one sentence can break across two rows
mid-word. Read a whole comment with an ordered aggregate:

```sql
SELECT ord_id, cmt_typ_cd, string_agg(cmt_txt, ' ' ORDER BY cmt_seq) AS note
FROM ord_cmt
GROUP BY ord_id, cmt_typ_cd;
```

| cmt_typ_cd | Meaning |
|---|---|
| `IN` | Internal. Never printed and never shown to the customer. |
| `EX` | External. Printed on the packing list. |

The `IN` comments are more valuable than they look. That is where order management
records the reason an order was cancelled or released, and it is the only place in
the whole extract that carries that reason.

## Related pages

- [Table directory](table-directory.md)
- [Customer master](customer-master.md)
- [Amounts and units](amounts-and-units.md)
- [Shipping and invoicing](shipping-and-invoicing.md)
- [Revenue reporting](revenue-reporting.md)
