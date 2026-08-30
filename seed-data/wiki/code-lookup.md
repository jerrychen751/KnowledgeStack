# Code lookup (code_lkp)

Owner: Data Governance (Marta Kowalczyk)
Source: Vantera ERP, nightly extract
Last reviewed: 2026-06-30

`code_lkp` is the one generic code table in the extract, and it does about eighty
percent of what you would want a code table to do. The key is `cd_typ` and `cd_val`.
The remaining twenty percent is what the rest of this page is about.

| Column | Meaning |
|---|---|
| `cd_typ` | The code family, such as `ORDSTAT`. |
| `cd_val` | One value inside that family, such as `IV`. |
| `cd_desc` | A short label for a screen. |
| `sort_seq` | The order the value appears in a drop-down list. |
| `actv_flg` | `N` marks a value the business retired. |

## What it covers

| cd_typ | Describes |
|---|---|
| `ORDSTAT` | `ord_hdr.ord_stat_cd` |
| `ORDTYP` | `ord_hdr.ord_typ_cd` |
| `LNSTAT` | `ord_ln.ln_stat_cd` |
| `CUSTTYP` | `cust_mstr.cst_typ_cd` |
| `CUSTSTAT` | `cust_mstr.stat_cd` |
| `INVCTYP` | `invc_hdr.invc_typ_cd` |
| `ADDRTYP` | `cust_addr.addr_typ_cd` |
| `ROLECD` | `cust_ctct.role_cd` |
| `JOBCD` | `emp_mstr.job_cd` |
| `QUALCD` | `part_mstr.qual_cd` |
| `RMARSN` | `rma_hdr.rsn_cd` |
| `RMASTAT` | `rma_hdr.rma_stat_cd` |
| `LOTSTAT` | `lot_mstr.lot_stat_cd` |
| `INCOCD` | `shpmt_hdr.inco_cd` |
| `CARRCD` | `shpmt_hdr.carr_cd` |
| `WHSTYP` | `whs_mstr.whs_typ_cd` |
| `CMTTYP` | `ord_cmt.cmt_typ_cd` |
| `MNTTYP` | `pkg_mstr.mnt_typ_cd` |

A join looks like `code_lkp.cd_typ = 'ORDSTAT' AND code_lkp.cd_val = h.ord_stat_cd`.

The `cd_typ` half is not optional, and this is worth saying loudly because leaving it
off produces results rather than an error. `cd_val` of `OP` exists in three families
at once, so a join on `cd_val` alone matches all three and every joined row
multiplies. The query still runs. The totals are just wrong.

## What it does not cover

Four coded columns have no row in `code_lkp` at all. Not a retired row, not an
inactive row. Nothing.

| Column | Where the values are documented |
|---|---|
| `part_mstr.fam_cd` | [Part numbering](part-numbering.md) |
| `cust_mstr.rgn_cd` | [Customer master](customer-master.md) |
| `part_mstr.fab_site_cd` | [Part numbering](part-numbering.md) |
| `lot_mstr.asy_site_cd` | [Inventory and lots](inventory-and-lots.md) |

`fam_cd` is the one that costs the most. It is the family that every Finance report
groups by, and the extract carries no name for it anywhere. If you want readable
family names on a chart, you are hard-coding them from the wiki page, and yes, we
know how that sounds.

Separately: `pay_terms`, `pkg_mstr`, `whs_mstr` and `sls_terr` are code tables in
their own right and are deliberately not repeated inside `code_lkp`. Join those
directly.

## Retired values

Three values carry `actv_flg = 'N'` and no row anywhere uses them.

| cd_typ | cd_val | Retired |
|---|---|---|
| `ORDSTAT` | `PN`, pending credit review | 2019 |
| `ORDTYP` | `EV`, evaluation board order | 2021 |
| `CUSTTYP` | `05`, government and defense prime | 2018 |

A drop-down list built from `code_lkp` should filter `actv_flg = 'Y'`. A report that
groups by a code does not need the filter, since no row carries a retired value.
Adding the filter anyway costs nothing.

## cd_desc is a label, not a rule

This one has burned people, so it gets its own section.

`cd_desc` is written to fit a screen field, roughly forty characters. It does not
carry the reporting rule that goes with a code, and reading it as one produces the
wrong answer.

The clearest example is `CUSTSTAT` value `H`, whose description is "Credit hold, net
terms suspended". Every word of that is true. It is also not the reporting rule: a
credit-hold account is an active customer whose shipped orders are revenue. Somebody
reading the label alone would reasonably conclude the opposite. See
[Revenue reporting](revenue-reporting.md).

Treat `cd_desc` as a screen label. Treat the wiki page as the rule.

## Related pages

- [Table directory](table-directory.md)
- [Order tables](order-tables.md)
- [Customer master](customer-master.md)
- [Revenue reporting](revenue-reporting.md)
