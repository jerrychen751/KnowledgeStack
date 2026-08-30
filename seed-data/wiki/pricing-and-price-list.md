# Pricing and the price list (price_lst)

Owner: Pricing Operations (Rob Feeney)
Source: Vantera ERP, nightly extract
Last reviewed: 2026-06-18

`price_lst` holds the contract price of one part for one account over one date range.
The key is `cust_id`, `part_no` and `eff_dt`. That third key column is the whole
story of this page: prices are effective dated, and queries that ignore that produce
discounts nobody ever gave.

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

The result is in basis points, so 800 means 8.00 percent off list.

For revenue, only one of these matters. `ord_hdr.tot_amt` is built from `unit_px`,
never from `lst_px`, and revenue always uses `unit_px`. `lst_px` answers exactly one
question: how much did we discount.

Both columns are in hundredths of a cent. See
[Amounts and units](amounts-and-units.md).

## The price list is effective dated

A row is valid from `eff_dt` to `exp_dt`, and both bounds are inclusive. A current
row carries `exp_dt = '9999-12-31'`, which is the usual sentinel and not a data
error.

Prices get renegotiated once a year, in the autumn, for the following calendar year.
So a customer and part that traded in both years has two rows:

| cust_id | part_no | eff_dt | exp_dt | lst_px |
|---|---|---|---|---|
| 1001 | VL1G08DBVR | 2024-10-01 | 2025-12-31 | 460 |
| 1001 | VL1G08DBVR | 2026-01-01 | 9999-12-31 | 400 |

**Pick the row by the order date, never by `MAX(eff_dt)`.**

This is the mistake. A lookup that takes the newest row prices a 2025 order at the
2026 contract, and since prices generally come down year over year, it reports a
discount that nobody gave and a margin that never existed.

```sql
JOIN price_lst p
  ON p.cust_id = h.cust_id
 AND p.part_no = l.part_no
 AND h.ord_dt BETWEEN p.eff_dt AND p.exp_dt
```

The ranges never overlap for one customer and part, so this join returns exactly one
row. If you get two, something upstream is broken and Pricing Operations wants to
hear about it.

## What the table does not hold

`price_lst` carries a row only for a customer and part pair that actually traded.
There is no list price for a pair that never ordered, and there is no global list
price at all, anywhere in the extract.

So a question like "what would this part cost customer X" has no answer here when X
never bought it. The answer exists in the quoting system, which is not part of this
extract.

`min_qty` is the quantity that unlocks the price, copied from `part_mstr.moq` at the
time the price was agreed. You will find a few standard order lines sitting below it.
That is legitimate: a representative can release a small top-up order at the agreed
price. Sample order lines are always far below it, because a sample is a handful of
pieces.

`appr_emp_id` is the sales representative who approved the price, and it joins to
`emp_mstr.emp_id`. Bear in mind it is the representative who owned the account when
the price was set, so on older rows it will happily name someone who left Vantera
years ago.

## Sample orders carry no discount

A sample order has `unit_px = 0` on every line. Feed that to the discount formula
above and it reports 10000 basis points, a 100 percent discount.

Arithmetically correct. Commercially meaningless. Exclude `ord_typ_cd = 'SA'` from
any discount analysis or your average discount will be dominated by giveaways. See
[Order tables](order-tables.md).

## Related pages

- [Table directory](table-directory.md)
- [Order tables](order-tables.md)
- [Part numbering](part-numbering.md)
- [Sales territories](sales-territories.md)
- [Amounts and units](amounts-and-units.md)
