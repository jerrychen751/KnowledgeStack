# Returns and RMA (rma_hdr)

Owner: Quality Systems
Source: Vantera ERP, nightly extract
Last reviewed: 2026-06-22

A return moves through three records. `rma_hdr` authorizes it, an order of type `RM`
receives the goods, and a credit memo in `invc_hdr` gives the money back.

## The three records

| Record | What it holds | How it points |
|---|---|---|
| `rma_hdr` | The authorization, the reason and the status. | `ord_id` names the **original** order the goods came from. |
| `ord_hdr` with `ord_typ_cd = 'RM'` | The return itself, with a negative `qty` on its line. | Linked to the RMA by `cust_id` and `part_no`. |
| `invc_hdr` with `invc_typ_cd = 'CR'` | The credit memo, with a negative `invc_amt`. | `rma_hdr.cr_invc_id` names it. Its own `ord_id` is the `RM` order. |

**`rma_hdr.ord_id` is the original order, not the return order.** It answers "what
did we ship them", not "what came back". Reading it as the return order links a
credit to the wrong period, because the original order can be a year older.

There is no column that joins `rma_hdr` to its `RM` order. The pair `cust_id` and
`part_no` is the only path, and it is unique in the data today.

## Reason (rsn_cd)

| rsn_cd | Meaning |
|---|---|
| `DOA` | Dead on arrival. The part failed the customer's incoming test. |
| `WRG` | Wrong part shipped. A Vantera picking error. |
| `EXS` | Excess stock return. A commercial return, not a fault. |
| `QLT` | Quality failure in customer test. Found after the part was assembled. |

`EXS` is not a quality event. A quality report that counts every RMA row treats a
distributor stock rotation as a field failure and overstates the failure rate.
Filter `rsn_cd IN ('DOA', 'QLT')` for a quality measure.

## Status (rma_stat_cd)

| rma_stat_cd | Meaning |
|---|---|
| `OP` | Open. Authorized, the goods have not arrived. |
| `RC` | Material received. The goods are back, the credit is not issued. |
| `CL` | Closed, credit issued. `clse_dt` and `cr_invc_id` are both set. |
| `RJ` | Rejected. The goods went back to the customer with no credit. |

`cr_invc_id` is `NULL` for every status except `CL`. A rejected RMA never produces a
credit, so a `NULL` there is not a missing value.

`clse_dt` is `NULL` while the RMA is `OP` or `RC`.

## Returns reduce revenue twice, so count them once

The value of a return appears in two places, and adding both double counts it.

- `ord_hdr.tot_amt` of the `RM` order is negative, because `ord_ln.qty` is negative.
- `invc_hdr.invc_amt` of the credit memo is negative, and equals that same value.

Pick one route and stay on it.

- Order-based revenue already nets returns, because the `RM` order sums in as a
  negative. Do not subtract credit memos as well.
- Invoice-based revenue nets returns only when credit memos are included. A filter of
  `invc_typ_cd = 'IN'` reports gross billings.

See [Revenue reporting](revenue-reporting.md).

## An open return is not yet a credit

An RMA in status `OP` or `RC` has no credit memo and no `RM` order. Its value is a
liability that no table in the extract carries as an amount. To estimate it, price
`rtn_qty` at the `unit_px` on the original order line:

```sql
SELECT r.rma_id, r.cust_id, r.part_no, r.rtn_qty,
       r.rtn_qty * l.unit_px / 100.0 / 100 AS exposure_usd
FROM rma_hdr r
JOIN ord_ln l ON l.ord_id = r.ord_id AND l.part_no = r.part_no
WHERE r.rma_stat_cd IN ('OP', 'RC');
```

## Related pages

- [Table directory](table-directory.md)
- [Shipping and invoicing](shipping-and-invoicing.md)
- [Order tables](order-tables.md)
- [Revenue reporting](revenue-reporting.md)
