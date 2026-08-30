# Pricing and the price list (price_lst)

Owner: Pricing Operations
Source: Vantera ERP, nightly extract
Last reviewed: 2026-06-18

`price_lst` holds the contract price of one part for one account over one date
range. The key is `cust_id`, `part_no` and `eff_dt`.

## Two prices sit on every order line

| Column | Meaning |
|---|---|
| `ord_ln.lst_px` | The contract price in force on the order date. Copied from `price_lst`. |
| `ord_ln.unit_px` | The price actually billed, after any order-level discount. |

`unit_px` is never higher than `lst_px`. The discount on a line is the gap between
them:

```sql
SELECT l.ord_id, l.ln_no, l.part_no,
       (l.lst_px - l.unit_px) * 10000 / l.lst_px AS discount_bp
FROM ord_ln l
WHERE l.lst_px > 0;
```

The result is in basis points: 800 is 8.00 percent off list.

`ord_hdr.tot_amt` is built from `unit_px`, never from `lst_px`. Revenue always uses
`unit_px`. `lst_px` answers only "how much did we discount".

Both columns are in hundredths of a cent. See [Amounts and units](amounts-and-units.md).

## The price list is effective dated

A row is valid from `eff_dt` to `exp_dt`, and both bounds are inclusive. A current
row carries `exp_dt = '9999-12-31'`. Prices are renegotiated once a year, so a
customer and part that traded in both years has two rows:

| cust_id | part_no | eff_dt | exp_dt | lst_px |
|---|---|---|---|---|
| 1001 | VL1G08DBVR | 2024-10-01 | 2025-12-31 | 460 |
| 1001 | VL1G08DBVR | 2026-01-01 | 9999-12-31 | 400 |

**Pick the row by the order date, never by `MAX(eff_dt)`.** A lookup that takes the
newest row prices a 2025 order at the 2026 contract and reports a discount that
nobody gave:

```sql
JOIN price_lst p
  ON p.cust_id = h.cust_id
 AND p.part_no = l.part_no
 AND h.ord_dt BETWEEN p.eff_dt AND p.exp_dt
```

The ranges never overlap for one customer and part, so this join returns one row.

## What the table does not hold

`price_lst` carries a row only for a customer and part pair that traded. There is no
list price for a pair that never ordered, and there is no global list price at all.
A question such as "what would this part cost customer X" has no answer in the
extract when X never bought it.

`min_qty` is the quantity that unlocks the price, copied from `part_mstr.moq` when
the price was agreed. A few standard order lines sit below it, because a
representative can release a small top-up order at the agreed price. Sample order
lines are always far below it, because a sample is a handful of pieces.

`appr_emp_id` is the sales representative who approved the price, and it joins to
`emp_mstr.emp_id`. It is the representative who owned the account when the price was
set, so it can name someone who has since left Vantera.

## Sample orders carry no discount

A sample order has `unit_px = 0` on every line, so the discount formula reports
10000 basis points, a 100 percent discount. That is arithmetically right and
commercially meaningless. Exclude `ord_typ_cd = 'SA'` from any discount analysis.
See [Order tables](order-tables.md).

## Related pages

- [Table directory](table-directory.md)
- [Order tables](order-tables.md)
- [Part numbering](part-numbering.md)
- [Sales territories](sales-territories.md)
- [Amounts and units](amounts-and-units.md)
