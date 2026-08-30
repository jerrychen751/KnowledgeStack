# Order history archive (ord_hdr_hist)

Owner: Finance Systems (Priya Raghavan)
Source: Legacy order system, one-time load on 2025-01-04
Last reviewed: 2026-05-04

`ord_hdr_hist` holds every order that closed before 2025. It came out of the order
system Vantera retired in 2024, the load ran exactly once, and nothing has touched it
since. `load_dt` carries the same value on every row: it records that load and tells
you nothing whatsoever about the order.

Think of this table as a photograph of a system that no longer exists. It is the only
source for any period before 2025-01-14, which is the earliest `ord_hdr.ord_dt`, and
the two tables never overlap.

Nearly everything about it differs from the modern extract. That is the point of this
page.

## The column names differ from ord_hdr

| ord_hdr_hist | Matches | Note |
|---|---|---|
| `ord_no` | `ord_hdr.ord_id` | Different id space. Values are 3001 to 3904. |
| `cust_no` | `cust_mstr.cust_id` | Not every value resolves. See below. |
| `ord_dt` | `ord_hdr.ord_dt` | Same meaning. |
| `stat` | `ord_hdr.ord_stat_cd` | One character, not two. Different values. |
| `tot_amt_usd` | `ord_hdr.tot_amt` | **Whole dollars, not cents.** |
| `sls_rep_ini` | nothing | Three initials. Joins to no table. |

And there are no line rows at all. The legacy system's line detail was not migrated,
which was a conscious decision at the time and one Finance has regretted at least
twice a year since. No question about a part number, a family or a quantity can be
answered for any period before 2025.

## tot_amt_usd is whole dollars

`ord_hdr.tot_amt` is in cents. `ord_hdr_hist.tot_amt_usd` is in whole US dollars,
with no multiplier at all.

A naive UNION of the two columns understates every archive row by a factor of 100,
which produces a chart where the business appears to have grown a hundredfold in
January 2025. It is at least an obvious error, which is more than can be said for
most of the traps in this extract.

Scale the archive up, never the modern table down, because scaling down loses the
cents:

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

Note the word "nearest". These are not the same codes with different spellings, they
are a different lifecycle model.

There is no archive equivalent of `OP` or `BO`, because the migration closed or
cancelled every open order before the cut-over. Whatever was in flight in December
2024 was forced to a decision.

`X` rows keep their `tot_amt_usd`, exactly the way `CN` rows keep their `tot_amt`.
Same trap, older table. Exclude `stat = 'X'` from any total.

One more thing: `code_lkp` does not describe these codes. Its `ORDSTAT` family
describes `ord_hdr` only, and there is no archive equivalent. See
[Code lookup](code-lookup.md).

## Four rows have no customer

`cust_no` values 9001 to 9004 do not exist in `cust_mstr`. Those accounts were purged
from the customer master before the archive load, and nothing recovered them. We have
looked. The source system is decommissioned.

An inner join to `cust_mstr` silently drops those four orders, which is the worst
possible behaviour: no error, no warning, just a slightly smaller number. Use a left
join and report them as unattributed when the question is about totals, and an inner
join only when the question genuinely needs a customer attribute:

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
built.

Treat the column as free text. It is occasionally useful for a human reading one row,
and useless for aggregation.

## A year on year comparison

This is the query people actually want. The archive and the modern table together
cover 2022 to 2026, and both the filters and the scales have to be right:

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

Notice that the two halves of the UNION do not apply the same rules, and cannot. The
archive rows carry no customer type and no deletion flag, so the intercompany and
deleted-account rules simply do not exist for them.

That means the pre-2025 years are not strictly comparable with the post-2025 years.
Say so in a footnote whenever you quote a year before 2025. Nobody will thank you for
it, and it will save you a conversation later.

## Related pages

- [Table directory](table-directory.md)
- [Amounts and units](amounts-and-units.md)
- [Revenue reporting](revenue-reporting.md)
- [Order tables](order-tables.md)
