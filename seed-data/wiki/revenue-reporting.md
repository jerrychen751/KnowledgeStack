# Revenue reporting

Owner: Finance Systems (Priya Raghavan)
Last reviewed: 2026-06-30

This page is the agreed definition of revenue against the order extract. If a figure
goes to Sales or to the executive staff, it uses these rules. Full stop.

That sounds heavy-handed, and it is, on purpose. The problem with this extract is not
that correct queries are hard to write. It is that incorrect ones look fine. Skip any
one of the five rules below and you get a number that is plausible, well formatted,
and wrong, and nobody in the room will be able to tell.

## The five rules

**1. Delivered orders only.** Count `ord_stat_cd` of `SH` or `IV`. `OP` and `BO` are
demand, not revenue. Watch `CN`: cancelled orders keep their rows *and* their
`tot_amt` after cancellation, so they have to be excluded by name. The ERP has never
zeroed them out and at this point it never will.

**2. External customers only.** Exclude `cst_typ_cd = '04'`. Those accounts are
Vantera's own subsidiaries, and their orders are internal transfers. Counting them is
how you book the same wafer twice.

**3. Live customer rows only.** Exclude `del_flg = 'Y'`. Those rows are duplicate or
merged accounts that were never physically removed.

**4. Credit hold still counts.** Do *not* exclude `stat_cd = 'H'`. A customer on
credit hold is an active customer that prepays. Its shipped and invoiced orders are
revenue and Finance treats them as revenue.

This is the single most common error in ad hoc queries against this extract. The
instinct to filter out anything that looks like a problem account is strong, and it
quietly deletes real money. If a number comes in low and you cannot explain the gap,
check this rule first.

**5. Exclude samples, keep returns.** Exclude `ord_typ_cd = 'SA'`. A sample order is
free, so it adds nothing to a sum, but it inflates every count of orders and
customers. Keep `ord_typ_cd = 'RM'`. A return order carries a negative quantity, so
it nets revenue down, and that is exactly what should happen.

Handy shortcut: `ord_typ_cd <> 'SA'` applies both halves of this rule in one
condition.

## Reference query

Revenue in US dollars for a calendar year. Start from this and change the dates:

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

The extract carries two sources of a revenue number. They answer different questions,
and in any recent period they will not agree.

| Route | Source | Date column | Use it for |
|---|---|---|---|
| Order based | `ord_hdr.tot_amt` | `ord_hdr.ord_dt` | A period figure, a family split, a territory split. |
| Invoice based | `invc_hdr.invc_amt` | `invc_hdr.invc_dt` | The figure Finance reconciles to the ledger. |

The order route reads the **ordered** quantity at the **order** date. The invoice
route reads the **shipped** quantity at the **invoice** date. Everything below follows
from that one sentence.

Three real gaps make the two disagree.

- An order with status `SH` shipped but is not billed yet, so it is in the order
  route and not in the invoice route.
- An order that shipped short was billed for less than its `tot_amt`. Order 5079 is
  53,325.00 USD ordered and 40,557.00 USD invoiced.
- An order that shipped in two pieces has two invoices in two different months, while
  the order route puts the whole value in the order month.

So: pick one route for a figure, and say in the deck which one you used. Do not add
them together. Somebody does this about once a year and the reconciliation takes a
week.

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

Note what is missing: there is no `invc_typ_cd` filter, and that is deliberate, not an
oversight. Credit memos carry a negative `invc_amt`, so leaving them in nets the
returns for you. Add `invc_typ_cd = 'IN'` and you get gross billings, which is a
perfectly good number for a different question and is not net revenue.

`invc_amt` excludes sales tax. Never add `tax_amt` to a revenue figure. That is money
Vantera collects on behalf of a tax authority and hands straight over.

## Revenue by product family

`tot_amt` sits on the header, so there is no family on it. A family breakdown has to
go through the lines, which means the line scale applies instead:

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

Look at the divisor. It is 10,000 here and 100 in the header query above, because
`qty * unit_px` lands in hundredths of a cent and one dollar is 10,000 of those. This
trips people who copy the header query and swap the FROM clause.

To turn a `fam_cd` into a readable family name, use the table in
[Part numbering](part-numbering.md). `code_lkp` does not hold it, however much it
looks like it should.

## Bookings against revenue

Bookings use `ord_dt` and include `OP` and `BO`, because a booking is an order
accepted. Revenue uses `shp_dt` at line level, or `ord_dt` when a monthly figure is
close enough for the audience.

The two numbers never match in a period with a backlog. That gap is expected and does
not need investigating.

Open backlog is the value still to ship:

```sql
SELECT SUM((l.qty - l.canc_qty) * l.unit_px) / 10000.0 AS backlog_usd
FROM ord_ln l
JOIN ord_hdr h ON h.ord_id = l.ord_id
WHERE h.ord_stat_cd IN ('OP', 'BO')
  AND h.ord_typ_cd <> 'SA';
```

Subtracting `canc_qty` is not optional. Leave it out and the backlog counts quantity
the customer already removed.

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

Be careful how you label this. `std_cost` is a standard cost, not an actual cost, so
what comes out is a planning margin. It is useful for comparing families against each
other. It is not the margin in the financials and Finance will say so.

## Counting customers

An active customer count uses the same rules 2 and 3, plus `stat_cd <> 'I'`. Credit
hold accounts are counted, same as rule 4.

Count `cust_id`, not `cust_nm`. Two accounts can carry the same trading name in
different regions and a distinct count on the name will silently merge them.

A count of customers that **bought** has to apply rule 5 as well, because a sample
order adds a customer that paid nothing.

One more: a corporate group counts as several customers, one per `cust_id`. When the
question is really about the group, roll up with `corp_cust_id`. See
[Customer master](customer-master.md).

## Anything before 2025

`ord_hdr` starts on 2025-01-14. Everything earlier lives in `ord_hdr_hist`, in whole
dollars, with different status codes and no line detail at all.

Rules 2, 3 and 5 cannot be applied there. There is nothing to join to. Read
[Order history archive](order-history-archive.md) before you promise anyone a
multi-year trend.

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
