# Sales territories (sls_terr, emp_mstr, cust_terr_asgn)

Owner: Sales Operations (Rob Feeney)
Source: Vantera ERP, nightly extract
Last reviewed: 2026-06-30

Two different columns answer two different questions about who owns a sale, and
reading the wrong one is comfortably the most common error in a territory report. It
is also the one people argue about hardest, because the person who lost the credit
notices immediately and the person who gained it does not.

| Question | Column to read |
|---|---|
| Who booked this order? | `ord_hdr.rep_emp_id` |
| Whose territory was this account in on that date? | `cust_terr_asgn` |
| Whose territory is this account in today? | `cust_terr_asgn` where `exp_dt = '9999-12-31'` |

## Employees (emp_mstr)

`emp_mstr` holds one row per Vantera employee who appears anywhere in the extract.

| job_cd | Meaning |
|---|---|
| `SLSR` | Sales representative. Books orders. |
| `SLSM` | Regional sales manager. Owns a set of territories. |
| `SLSV` | Vice president of sales. |
| `APPE` | Applications engineer. Never books an order. |

`mgr_emp_id` names the manager and joins back to `emp_mstr.emp_id`. It is `NULL` for
the vice president and nobody else, so it is safe to walk upwards.

`term_dt` is the day the employee left, and it is `NULL` for a current employee.

**A representative who left still owns every order they booked.** Two employees in
this data carry a `term_dt`, and their `emp_id` values still appear in
`ord_hdr.rep_emp_id` and in `price_lst.appr_emp_id`, exactly as they should.

Filtering `term_dt IS NULL` to "clean up" the employee list drops those orders and
understates every historical period. It looks like tidying. It is deleting revenue.

## Territories (sls_terr)

`terr_cd` is six characters: a two-letter region prefix, a dash, and a
three-character area. So `AM-NE1`, or `JP-KSI`.

`sls_terr.rgn_cd` uses the same four values as `cust_mstr.rgn_cd`: `AMER`, `EMEA`,
`APAC` and `JAPN`. A territory and its accounts always sit in the same region, so
either column gives the same regional total. That invariant has held since the
territory model was rebuilt, and Sales Operations will fix it if it ever breaks.

`sls_terr.mgr_emp_id` is the regional sales manager, not the representative. Do not
use it to credit a sale.

`actv_flg = 'N'` marks a territory Vantera closed. `AM-NW1` is closed and holds no
account.

## The assignment bridge (cust_terr_asgn)

One row assigns one account to one territory and one representative over one date
range. The key is `cust_id` and `eff_dt`. Both bounds are inclusive, and an open row
carries `exp_dt = '9999-12-31'`.

**Join it on the order date, not on the current row:**

```sql
SELECT t.terr_cd, SUM(h.tot_amt) / 100.0 AS revenue_usd
FROM ord_hdr h
JOIN cust_mstr c ON c.cust_id = h.cust_id
JOIN cust_terr_asgn a
  ON a.cust_id = h.cust_id AND h.ord_dt BETWEEN a.eff_dt AND a.exp_dt
JOIN sls_terr t ON t.terr_cd = a.terr_cd
WHERE h.ord_stat_cd IN ('SH', 'IV')
  AND h.ord_typ_cd <> 'SA'
  AND c.cst_typ_cd <> '04'
  AND c.del_flg = 'N'
GROUP BY t.terr_cd
ORDER BY revenue_usd DESC;
```

The ranges never overlap for one account, so this join returns exactly one row per
order.

Drop the date condition and you get every historical assignment instead, which
multiplies the revenue of every account that ever moved. Since the accounts that move
tend to be the big ones, the error lands where it hurts most.

## The two reassignments in the data

Two events split the history. A report that ignores them credits the wrong person,
and both of these are recent enough to appear in any current-year analysis.

- **2025-10-01.** Callum Radzik, `emp_id` 2009, left Vantera on 2025-09-30. His eight
  accounts in `AM-WST` moved to Bridget Sandoval, `emp_id` 2008, on 2025-10-01. The
  territory code did not change, so this one is invisible at territory level and very
  visible at representative level. Orders those accounts booked before that day still
  carry `rep_emp_id = 2009`.
- **2026-04-01.** Toshiro Ebina, `emp_id` 2016, left on 2026-03-31. His two accounts
  moved from territory `JP-KSI` to territory `JP-KAN` and to Hana Sugimoto,
  `emp_id` 2015. Here the territory code changed as well. The consequence: a report
  of `JP-KSI` revenue built on the *current* assignment shows zero for a territory
  that traded happily until March 2026.

One further move is commercial rather than a leaver: Halcyon Automotive de Mexico
moved from `AM-SE1` to `AM-CEN` on 2026-01-01, so it now sits with its parent
account.

## Related pages

- [Table directory](table-directory.md)
- [Customer master](customer-master.md)
- [Order tables](order-tables.md)
- [Revenue reporting](revenue-reporting.md)
