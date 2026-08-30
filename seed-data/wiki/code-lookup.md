# Code lookup (code_lkp)

Owner: Data Governance
Source: Vantera ERP, nightly extract
Last reviewed: 2026-06-30

`code_lkp` is the one generic code table in the extract. The key is `cd_typ` and
`cd_val`.

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

A join is `code_lkp.cd_typ = 'ORDSTAT' AND code_lkp.cd_val = h.ord_stat_cd`. The
`cd_typ` condition is required. Without it, `cd_val` of `OP` matches three families
at once and every joined row multiplies.

## What it does not cover

Four coded columns have no row in `code_lkp` at all.

| Column | Where the values are documented |
|---|---|
| `part_mstr.fam_cd` | [Part numbering](part-numbering.md) |
| `cust_mstr.rgn_cd` | [Customer master](customer-master.md) |
| `part_mstr.fab_site_cd` | [Part numbering](part-numbering.md) |
| `lot_mstr.asy_site_cd` | [Inventory and lots](inventory-and-lots.md) |

`fam_cd` is the one that costs the most. It is the family every Finance report groups
by, and the extract carries no name for it anywhere.

`pay_terms`, `pkg_mstr`, `whs_mstr` and `sls_terr` are code tables of their own and
are not repeated inside `code_lkp`.

## Retired values

Three values carry `actv_flg = 'N'` and no row anywhere uses them.

| cd_typ | cd_val | Retired |
|---|---|---|
| `ORDSTAT` | `PN`, pending credit review | 2019 |
| `ORDTYP` | `EV`, evaluation board order | 2021 |
| `CUSTTYP` | `05`, government and defense prime | 2018 |

A drop-down list built from `code_lkp` should filter `actv_flg = 'Y'`. A report that
groups by a code does not need the filter, because no row carries a retired value.

## cd_desc is a label, not a rule

`cd_desc` is written to fit a screen field. It does not carry the reporting rule that
goes with a code, and reading it as one produces the wrong answer.

The clearest example is `CUSTSTAT` value `H`, whose description is "Credit hold, net
terms suspended". That is true and it is not the reporting rule. A credit-hold
account is an active customer whose shipped orders are revenue. See
[Revenue reporting](revenue-reporting.md).

## Related pages

- [Table directory](table-directory.md)
- [Order tables](order-tables.md)
- [Customer master](customer-master.md)
- [Revenue reporting](revenue-reporting.md)
