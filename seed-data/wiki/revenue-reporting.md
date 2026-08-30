# Revenue reporting

Owner: Finance Systems
Last reviewed: 2026-06-30

This page is the agreed definition of revenue against the order extract. Any figure
quoted to Sales or to the executive staff uses these rules. A query that skips one of
them produces a number that looks plausible and is wrong.

## The five rules

**1. Delivered orders only.** Count `ord_stat_cd` of `SH` or `IV`. `OP` and `BO` are
demand, not revenue. `CN` orders keep their rows and their `tot_amt` after
cancellation, so they must be excluded by name.

**2. External customers only.** Exclude `cst_typ_cd = '04'`. Those accounts are
Vantera's own subsidiaries and their orders are internal transfers.

**3. Live customer rows only.** Exclude `del_flg = 'Y'`. Those rows are duplicate or
merged accounts.

**4. Credit hold still counts.** Do not exclude `stat_cd = 'H'`. A customer on credit
hold is an active customer that prepays. Its shipped and invoiced orders are revenue.
Excluding it is the most common error in ad hoc queries against this extract.

**5. Exclude samples, keep returns.** Exclude `ord_typ_cd = 'SA'`. A sample order is
free, so it adds nothing to a sum, but it inflates every count of orders and
customers. Keep `ord_typ_cd = 'RM'`. A return order carries a negative quantity, so
it nets revenue down, and that is correct. `ord_typ_cd <> 'SA'` applies both halves
of this rule in one condition.

## Reference query

Revenue in US dollars for a calendar year:

```sql
SELECT SUM(h.tot_amt) / 100.0 AS revenue_usd
FROM ord_hdr h
JOIN cust_mstr c ON c.cust_id = h.cust_id
WHERE h.ord_stat_cd IN ('SH', 'IV')
  AND h.ord_typ_cd <> 'SA'
  AND c.cst_typ_cd <> '04'
  AND c.del_flg = 'N'
  AND h.ord_dt >= DATE '2025-01-01'
  AND h.ord_dt <  DATE '2026-01-01';
```

`tot_amt` is in cents. See [Amounts and units](amounts-and-units.md).

## Two routes to revenue, and when each is right

The extract carries two sources. They answer different questions and they do not
agree in any recent period.

| Route | Source | Date column | Use it for |
|---|---|---|---|
| Order based | `ord_hdr.tot_amt` | `ord_hdr.ord_dt` | A period figure, a family split, a territory split. |
| Invoice based | `invc_hdr.invc_amt` | `invc_hdr.invc_dt` | The figure Finance reconciles to the ledger. |

The order route reads the **ordered** quantity at the **order** date. The invoice
route reads the **shipped** quantity at the **invoice** date.

Three real gaps make the two disagree.

- An order with status `SH` shipped but is not billed yet, so it is in the order
  route and not in the invoice route.
- An order that shipped short was billed for less than its `tot_amt`. Order 5079 is
  53,325.00 USD ordered and 40,557.00 USD invoiced.
- An order that shipped in two pieces has two invoices in two different months, while
  the order route puts the whole value in the order month.

Pick one route for a figure and say which one you used. Do not add them together.

See [Shipping and invoicing](shipping-and-invoicing.md).

## Invoiced revenue

```sql
SELECT SUM(i.invc_amt) / 100.0 AS invoiced_usd
FROM invc_hdr i
JOIN cust_mstr c ON c.cust_id = i.cust_id
WHERE c.cst_typ_cd <> '04'
  AND c.del_flg = 'N'
  AND i.invc_dt >= DATE '2025-01-01'
  AND i.invc_dt <  DATE '2026-01-01';
```

There is no `invc_typ_cd` filter, and that is deliberate. Credit memos carry a
negative `invc_amt`, so including them nets the returns. `invc_typ_cd = 'IN'` gives
gross billings, which is a different number.

`invc_amt` excludes sales tax. Never add `tax_amt` to a revenue figure. It is money
Vantera collects for a tax authority.

## Revenue by product family

`tot_amt` sits on the header, so a family breakdown has to go through the lines and
apply the line scale instead:

```sql
SELECT p.fam_cd, SUM(l.qty * l.unit_px) / 10000.0 AS revenue_usd
FROM ord_ln l
JOIN ord_hdr h ON h.ord_id = l.ord_id
JOIN cust_mstr c ON c.cust_id = h.cust_id
JOIN part_mstr p ON p.part_no = l.part_no
WHERE h.ord_stat_cd IN ('SH', 'IV')
  AND h.ord_typ_cd <> 'SA'
  AND c.cst_typ_cd <> '04'
  AND c.del_flg = 'N'
GROUP BY p.fam_cd
ORDER BY revenue_usd DESC;
```

The divisor is 10,000 and not 100: `qty * unit_px` is in hundredths of a cent, and one
dollar is 10,000 of those.

Map `fam_cd` to a family name with the table in
[Part numbering](part-numbering.md). `code_lkp` does not hold it.

## Bookings against revenue

Bookings use `ord_dt` and include `OP` and `BO`, because a booking is an order
accepted. Revenue uses `shp_dt` at line level, or `ord_dt` when a monthly figure is
close enough. The two numbers never match in a period with a backlog, and that gap
is expected.

Open backlog is the value still to ship:

```sql
SELECT SUM((l.qty - l.canc_qty) * l.unit_px) / 10000.0 AS backlog_usd
FROM ord_ln l
JOIN ord_hdr h ON h.ord_id = l.ord_id
WHERE h.ord_stat_cd IN ('OP', 'BO')
  AND h.ord_typ_cd <> 'SA';
```

Subtract `canc_qty`, or the backlog counts quantity the customer already removed.

## Margin

Gross margin needs `part_mstr.std_cost`, which is on the same scale as `unit_px`:

```sql
SELECT p.fam_cd,
       SUM(l.qty * (l.unit_px - p.std_cost)) / 10000.0 AS margin_usd,
       SUM(l.qty * l.unit_px) / 10000.0 AS revenue_usd
FROM ord_ln l
JOIN ord_hdr h ON h.ord_id = l.ord_id
JOIN cust_mstr c ON c.cust_id = h.cust_id
JOIN part_mstr p ON p.part_no = l.part_no
WHERE h.ord_stat_cd IN ('SH', 'IV')
  AND h.ord_typ_cd <> 'SA'
  AND c.cst_typ_cd <> '04'
  AND c.del_flg = 'N'
GROUP BY p.fam_cd;
```

`std_cost` is a standard cost, not an actual cost, so this is a planning margin.

## Counting customers

An active customer count uses the same rules 2 and 3, plus `stat_cd <> 'I'`. Credit
hold accounts are counted. Count `cust_id`, not `cust_nm`: two accounts can carry
the same trading name in different regions.

A count of customers that **bought** must also apply rule 5, because a sample order
adds a customer that paid nothing.

A corporate group counts as several customers, one per `cust_id`. Roll up with
`corp_cust_id` when the question is about a group. See
[Customer master](customer-master.md).

## Anything before 2025

`ord_hdr` starts on 2025-01-14. Every earlier period lives in `ord_hdr_hist`, in
whole dollars, with different status codes and no line detail. Rules 2, 3 and 5
cannot be applied there. See [Order history archive](order-history-archive.md).

## Related pages

- [Table directory](table-directory.md)
- [Customer master](customer-master.md)
- [Order tables](order-tables.md)
- [Amounts and units](amounts-and-units.md)
- [Part numbering](part-numbering.md)
- [Shipping and invoicing](shipping-and-invoicing.md)
- [Sales territories](sales-territories.md)
- [Returns and RMA](returns-and-rma.md)
- [Order history archive](order-history-archive.md)
