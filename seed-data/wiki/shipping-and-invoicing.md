# Shipping and invoicing (shpmt_hdr, shpmt_ln, invc_hdr, invc_ln)

Owner: Finance Systems
Source: Vantera ERP, nightly extract
Last reviewed: 2026-06-30

An order line can ship in more than one piece, and a shipment is billed by one
invoice. The chain is `ord_ln` to `shpmt_ln` to `invc_ln`, and each step can lose
quantity.

## The chain

```
ord_hdr --< ord_ln
              ^
              |  ord_id + ln_no
              |
shpmt_hdr --< shpmt_ln
    |
    | shpmt_id + 2000 = invc_id
    v
invc_hdr --< invc_ln
```

The join paths are:

- `shpmt_hdr.ord_id` to `ord_hdr.ord_id`
- `shpmt_hdr.whs_cd` to `whs_mstr.whs_cd`
- `shpmt_ln.shpmt_id` to `shpmt_hdr.shpmt_id`
- `shpmt_ln.ord_id` and `shpmt_ln.ln_no` to `ord_ln.ord_id` and `ord_ln.ln_no`
- `shpmt_ln.lot_id` to `lot_mstr.lot_id`
- `invc_hdr.ord_id` to `ord_hdr.ord_id`
- `invc_hdr.cust_id` to `cust_mstr.cust_id`
- `invc_ln.ord_id` and `invc_ln.ln_no` to `ord_ln.ord_id` and `ord_ln.ln_no`

**Never join `shpmt_ln` to `ord_ln` on `ln_no` alone.** `ln_no` restarts at 1 on
every order, so that join matches line 1 of every order against line 1 of every
other order.

## An order can have several shipments

`shpmt_hdr` has one row per pack list, not one row per order. An order ships in two
pieces when the warehouse holds part of it and the rest arrives later, or when the
customer asked for a split delivery.

A count of shipments is not a count of orders. Count `DISTINCT ord_id` when the
question asks how many orders shipped.

## A shipment can be short

`shpmt_ln.shp_qty` is the quantity that left the dock, and it can be less than
`ord_ln.qty`. When it is less and the rest is still open, the order line carries
`ln_stat_cd = 'PS'`.

The open quantity of a line is:

```sql
SELECT l.ord_id, l.ln_no,
       l.qty - l.canc_qty - COALESCE(SUM(s.shp_qty), 0) AS open_qty
FROM ord_ln l
LEFT JOIN shpmt_ln s ON s.ord_id = l.ord_id AND s.ln_no = l.ln_no
GROUP BY l.ord_id, l.ln_no, l.qty, l.canc_qty;
```

## Warehouses (whs_mstr)

`shpmt_hdr.whs_cd` names the warehouse that shipped. The warehouse follows the region
of the customer, so a shipment to an EMEA account leaves `EIN1` in Eindhoven.

`whs_mstr.whs_typ_cd` is `DC` for a distribution centre and `CH` for a consignment
hub. `whs_mstr.actv_flg = 'N'` marks a warehouse Vantera closed. `CHI3` in Chicago is
closed and no shipment in the extract leaves it.

## Freight and Incoterms

`shpmt_hdr.frt_amt` is the freight Vantera paid the carrier, in cents. It is a cost,
not something the customer was billed, and it never appears on an invoice.

`shpmt_hdr.inco_cd` is the Incoterm: `DAP` delivered at place, `EXW` ex works, `FCA`
free carrier. `shpmt_hdr.trk_no` is the carrier tracking number and it is `NULL` for
a less-than-truckload freight shipment, which has no piece-level tracking.

## Invoices (invc_hdr)

One invoice bills one shipment. An order that shipped twice carries two invoices.

| invc_typ_cd | Meaning |
|---|---|
| `IN` | Invoice. `invc_amt` is positive. |
| `CR` | Credit memo. `invc_amt` is negative. |
| `DB` | Debit memo. No row carries this code today. |

**`SUM(invc_amt)` is correct only when credit memos are included.** A filter of
`invc_typ_cd = 'IN'` reports gross billings and overstates net revenue by the value
of every return. See [Returns and RMA](returns-and-rma.md).

An order whose status is `SH` has shipped but has no invoice yet. That is the normal
state for a few days after the dock scan, and it is why invoiced revenue for a recent
month is lower than order-based revenue for the same month.

## What invc_amt covers

`invc_amt` is the value of the goods only. Sales tax sits in `tax_amt` as a separate
column, and freight is never billed.

The customer owes `invc_amt + tax_amt`. A receivable query that reads `invc_amt`
alone understates what is owed on every taxed invoice.

`tax_amt` is non-zero only on invoices to AMER accounts of type `02`, OEM direct,
because every other account gives Vantera a resale certificate or is an export.
A zero `tax_amt` is not a missing value.

## Payment

`paid_amt` is what the customer paid, and `pay_dt` is the day the cash cleared. Both
are zero and `NULL` on an unpaid invoice.

A fully paid invoice has `paid_amt = invc_amt + tax_amt`. The extract carries no
partial payment today, so `paid_amt` is either zero or the full amount.

Outstanding receivable, and the part of it that is past due:

```sql
SELECT i.cust_id,
       SUM(i.invc_amt + i.tax_amt - i.paid_amt) / 100.0 AS outstanding_usd,
       SUM(CASE WHEN i.due_dt < DATE '2026-06-30'
                THEN i.invc_amt + i.tax_amt - i.paid_amt ELSE 0 END) / 100.0 AS overdue_usd
FROM invc_hdr i
WHERE i.paid_amt = 0
GROUP BY i.cust_id
ORDER BY outstanding_usd DESC;
```

`due_dt` is `invc_dt` plus `pay_terms.net_days` for the terms on the order. A
prepayment account has `net_days = 0`, so its invoice is due the day it is raised.

## Related pages

- [Table directory](table-directory.md)
- [Order tables](order-tables.md)
- [Revenue reporting](revenue-reporting.md)
- [Returns and RMA](returns-and-rma.md)
- [Amounts and units](amounts-and-units.md)
