# Order history archive (ord_hdr_hist)

Owner: Finance Systems
Source: Legacy order system, one-time load on 2025-01-04
Last reviewed: 2026-05-04

`ord_hdr_hist` holds every order that closed before 2025. It came from the order
system Vantera retired in 2024, and the load ran once. `load_dt` is the same value on
every row and it records that load, not anything about the order.

The table is the only source for any period before 2025-01-14, which is the earliest
`ord_hdr.ord_dt`. The two tables never overlap.

## The column names differ from ord_hdr

| ord_hdr_hist | Matches | Note |
|---|---|---|
| `ord_no` | `ord_hdr.ord_id` | Different id space. Values are 3001 to 3904. |
| `cust_no` | `cust_mstr.cust_id` | Not every value resolves. See below. |
| `ord_dt` | `ord_hdr.ord_dt` | Same meaning. |
| `stat` | `ord_hdr.ord_stat_cd` | One character, not two. Different values. |
| `tot_amt_usd` | `ord_hdr.tot_amt` | **Whole dollars, not cents.** |
| `sls_rep_ini` | nothing | Three initials. Joins to no table. |

There are no line rows. The legacy system's line detail was not migrated, so no
question about a part number, a family or a quantity can be answered before 2025.

## tot_amt_usd is whole dollars

`ord_hdr.tot_amt` is in cents. `ord_hdr_hist.tot_amt_usd` is in whole US dollars,
with no multiplier at all.

A UNION of the two columns understates every archive row by a factor of 100. Scale
the archive up, never the modern table down, because scaling down loses the cents:

```sql
SELECT ord_dt, tot_amt AS amount_cents FROM ord_hdr
UNION ALL
SELECT ord_dt, tot_amt_usd * 100 FROM ord_hdr_hist;
```

See [Amounts and units](amounts-and-units.md).

## Status codes differ

| stat | Meaning | Nearest ord_hdr value |
|---|---|---|
| `C` | Closed. Shipped, invoiced and paid. | `IV` |
| `S` | Shipped, never invoiced when the system was retired. | `SH` |
| `X` | Cancelled. | `CN` |

There is no archive equivalent of `OP` or `BO`, because the migration closed or
cancelled every open order before the cut-over.

`X` rows keep their `tot_amt_usd`, exactly as `CN` rows keep their `tot_amt`. Exclude
`stat = 'X'` from any total.

`code_lkp` does not describe these codes. Its `ORDSTAT` family describes `ord_hdr`
only. See [Code lookup](code-lookup.md).

## Four rows have no customer

`cust_no` values 9001 to 9004 do not exist in `cust_mstr`. Those accounts were purged
from the customer master before the archive load, and nothing recovered them.

An inner join to `cust_mstr` silently drops those four orders. Use a left join and
report them as unattributed when the question is about totals, and an inner join only
when the question needs a customer attribute:

```sql
SELECT COALESCE(c.cust_nm, 'unattributed legacy account') AS customer,
       SUM(x.tot_amt_usd) AS revenue_usd
FROM ord_hdr_hist x
LEFT JOIN cust_mstr c ON c.cust_id = x.cust_no
WHERE x.stat <> 'X'
GROUP BY 1;
```

## sls_rep_ini joins to nothing

`sls_rep_ini` holds three initials from the legacy system. `emp_mstr` has no initials
column, and several of the values belong to people who left before `emp_mstr` was
built. Treat the column as free text.

## A year on year comparison

The archive and the modern table together cover 2022 to 2026. Both filters and both
scales have to be right:

```sql
SELECT extract(year FROM ord_dt)::int AS yr, SUM(amount_cents) / 100.0 AS revenue_usd
FROM (
    SELECT h.ord_dt, h.tot_amt AS amount_cents
    FROM ord_hdr h
    JOIN cust_mstr c ON c.cust_id = h.cust_id
    WHERE h.ord_stat_cd IN ('SH', 'IV')
      AND h.ord_typ_cd <> 'SA'
      AND c.cst_typ_cd <> '04'
      AND c.del_flg = 'N'
    UNION ALL
    SELECT x.ord_dt, x.tot_amt_usd * 100
    FROM ord_hdr_hist x
    WHERE x.stat <> 'X'
) y
GROUP BY 1
ORDER BY 1;
```

The archive rows carry no customer type and no deletion flag, so the intercompany and
deleted-account rules cannot be applied to them. State that limit whenever you quote
a year before 2025.

## Related pages

- [Table directory](table-directory.md)
- [Amounts and units](amounts-and-units.md)
- [Revenue reporting](revenue-reporting.md)
- [Order tables](order-tables.md)
