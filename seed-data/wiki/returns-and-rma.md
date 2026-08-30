# Returns and RMA (rma_hdr)

Owner: Quality Systems (Hannah Oduya)
Source: Vantera ERP, nightly extract
Last reviewed: 2026-06-22

A return moves through three separate records, which is two more than most people
expect. `rma_hdr` authorizes it, an order of type `RM` receives the goods, and a
credit memo in `invc_hdr` gives the money back.

## The three records

| Record | What it holds | How it points |
|---|---|---|
| `rma_hdr` | The authorization, the reason and the status. | `ord_id` names the **original** order the goods came from. |
| `ord_hdr` with `ord_typ_cd = 'RM'` | The return itself, with a negative `qty` on its line. | Linked to the RMA by `cust_id` and `part_no`. |
| `invc_hdr` with `invc_typ_cd = 'CR'` | The credit memo, with a negative `invc_amt`. | `rma_hdr.cr_invc_id` names it. Its own `ord_id` is the `RM` order. |

**`rma_hdr.ord_id` is the original order, not the return order.** Read that twice.
It answers "what did we ship them", not "what came back". Treating it as the return
order links a credit to the wrong period, and since the original order can easily be
a year older, the error is not subtle once someone notices.

There is also no column that joins `rma_hdr` to its `RM` order. The pair `cust_id`
and `part_no` is the only path available, and it happens to be unique in the data
today. That is luck, not design, so sanity check your row counts.

## Reason (rsn_cd)

| rsn_cd | Meaning |
|---|---|
| `DOA` | Dead on arrival. The part failed the customer's incoming test. |
| `WRG` | Wrong part shipped. A Vantera picking error. |
| `EXS` | Excess stock return. A commercial return, not a fault. |
| `QLT` | Quality failure in customer test. Found after the part was assembled. |

The one to watch is `EXS`. It is not a quality event at all, it is a distributor
clearing shelf space. A quality report that counts every RMA row treats a routine
stock rotation as a field failure and overstates the failure rate, sometimes by a
lot, since `EXS` returns are large and `DOA` returns are small.

For a quality measure, filter `rsn_cd IN ('DOA', 'QLT')`.

## Status (rma_stat_cd)

| rma_stat_cd | Meaning |
|---|---|
| `OP` | Open. Authorized, the goods have not arrived. |
| `RC` | Material received. The goods are back, the credit is not issued. |
| `CL` | Closed, credit issued. `clse_dt` and `cr_invc_id` are both set. |
| `RJ` | Rejected. The goods went back to the customer with no credit. |

`cr_invc_id` is `NULL` for every status except `CL`. On a rejected RMA that `NULL` is
the correct answer, not a gap in the data: a rejected RMA never produces a credit.

`clse_dt` is `NULL` while the RMA is `OP` or `RC`.

## Returns reduce revenue twice, so count them once

The value of a return appears in two places. Add both and you have double counted the
return, which pushes revenue down instead of up and therefore tends to survive review
longer than it should.

- `ord_hdr.tot_amt` of the `RM` order is negative, because `ord_ln.qty` is negative.
- `invc_hdr.invc_amt` of the credit memo is negative, and equals that same value.

Pick one route and stay on it:

- Order-based revenue already nets returns, because the `RM` order sums in as a
  negative. Do not subtract credit memos as well.
- Invoice-based revenue nets returns only when credit memos are included. A filter of
  `invc_typ_cd = 'IN'` reports gross billings instead.

See [Revenue reporting](revenue-reporting.md).

## An open return is not yet a credit

An RMA in status `OP` or `RC` has no credit memo and no `RM` order yet. Its value is
a liability sitting out there that no table in the extract carries as an amount,
which Finance asks about at every quarter close.

To estimate it, price `rtn_qty` at the `unit_px` on the original order line:

```sql
SELECT r.rma_id, r.cust_id, r.part_no, r.rtn_qty,
       r.rtn_qty * l.unit_px / 100.0 / 100 AS exposure_usd
FROM rma_hdr r
JOIN ord_ln l ON l.ord_id = r.ord_id AND l.part_no = r.part_no
WHERE r.rma_stat_cd IN ('OP', 'RC');
```

This is an estimate. The credit finally issued can differ if the goods arrive short
or fail inspection.

## Related pages

- [Table directory](table-directory.md)
- [Shipping and invoicing](shipping-and-invoicing.md)
- [Order tables](order-tables.md)
- [Revenue reporting](revenue-reporting.md)
