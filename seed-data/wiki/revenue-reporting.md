# Revenue reporting

Owner: Finance Systems
Last reviewed: 2026-06-11

This page is the agreed definition of revenue against the order extract. Any figure
quoted to Sales or to the executive staff uses these rules. A query that skips one of
them produces a number that looks plausible and is wrong.

## The four rules

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

## Reference query

Revenue in US dollars for a calendar year:

```sql
SELECT SUM(h.tot_amt) / 100.0 AS revenue_usd
FROM ord_hdr h
JOIN cust_mstr c ON c.cust_id = h.cust_id
WHERE h.ord_stat_cd IN ('SH', 'IV')
  AND c.cst_typ_cd <> '04'
  AND c.del_flg = 'N'
  AND h.ord_dt >= DATE '2025-01-01'
  AND h.ord_dt <  DATE '2026-01-01';
```

`tot_amt` is in cents. See [Amounts and units](amounts-and-units.md).

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
  AND c.cst_typ_cd <> '04'
  AND c.del_flg = 'N'
GROUP BY p.fam_cd
ORDER BY revenue_usd DESC;
```

The divisor is 10,000 and not 100: `qty * unit_px` is in hundredths of a cent, and one
dollar is 10,000 of those.

Map `fam_cd` to a family name with the table in
[Part numbering](part-numbering.md).

## Bookings against revenue

Bookings use `ord_dt` and include `OP` and `BO`, because a booking is an order
accepted. Revenue uses `shp_dt` at line level, or `ord_dt` when a monthly figure is
close enough. The two numbers never match in a period with a backlog, and that gap
is expected.

## Counting customers

An active customer count uses the same rules 2 and 3, plus `stat_cd <> 'I'`. Credit
hold accounts are counted. Count `cust_id`, not `cust_nm`: two accounts can carry
the same trading name in different regions.

## Related pages

- [Customer master](customer-master.md)
- [Order tables](order-tables.md)
- [Amounts and units](amounts-and-units.md)
- [Part numbering](part-numbering.md)
