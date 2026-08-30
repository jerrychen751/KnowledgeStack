# Inventory and lots (inv_bal, whs_mstr, lot_mstr)

Owner: Supply Chain Systems
Source: Vantera ERP, nightly extract
Last reviewed: 2026-06-30

Two tables describe material. `inv_bal` is a stock snapshot. `lot_mstr` is a
production record. They do not join to each other.

## inv_bal is a snapshot table, not a balance

`inv_bal` holds one row per part, per warehouse, per month end. The key is
`snap_dt`, `part_no` and `whs_cd`. The extract holds six month-end snapshots, from
2026-01-31 to 2026-06-30.

**Every query against `inv_bal` needs a `snap_dt` filter.** A query without one sums
six months of stock and reports a figure six times too high. Nothing in the schema
signals that the table is a snapshot, and the number it returns looks plausible.

Current stock of one part:

```sql
SELECT part_no, whs_cd, on_hnd_qty
FROM inv_bal
WHERE snap_dt = (SELECT MAX(snap_dt) FROM inv_bal)
  AND part_no = 'VP5433DDAR';
```

Stock across every warehouse, at the latest snapshot:

```sql
SELECT part_no, SUM(on_hnd_qty) AS on_hand
FROM inv_bal
WHERE snap_dt = (SELECT MAX(snap_dt) FROM inv_bal)
GROUP BY part_no;
```

| Column | Meaning |
|---|---|
| `on_hnd_qty` | Pieces physically in the warehouse. |
| `alloc_qty` | Pieces already promised to an open order. Part of `on_hnd_qty`. |
| `on_ord_qty` | Pieces on a replenishment order, not yet in the warehouse. |

`alloc_qty` is a subset of `on_hnd_qty`, so free stock is `on_hnd_qty - alloc_qty`.
Adding the two double counts. `on_ord_qty` is not in the warehouse, so it is never
part of `on_hnd_qty`.

A snapshot covers the four distribution centres `DAL1`, `EIN1`, `SIN1` and `OSA1`
only. The consignment hub `PEN1` holds customer-owned stock and never appears in
`inv_bal`, and the closed centre `CHI3` stopped reporting.

## Warehouses (whs_mstr)

| Column | Meaning |
|---|---|
| `whs_cd` | Four characters, three letters of the city plus a digit. |
| `rgn_cd` | The same four region values as `cust_mstr.rgn_cd`. |
| `whs_typ_cd` | `DC` distribution centre, `CH` consignment hub. |
| `actv_flg` | `N` marks a closed warehouse. |

## Production lots (lot_mstr)

One row is one production lot. `lot_id` is `L`, then the two-digit year and
two-digit month of the start date, then a four-digit sequence, such as `L24010016`.

| Column | Meaning |
|---|---|
| `part_no` | The part the lot produces. Joins to `part_mstr.part_no`. |
| `fab_site_cd` | The wafer fab. Matches `part_mstr.fab_site_cd`. |
| `asy_site_cd` | The assembly and test site, which is never the fab. |
| `strt_dt` | The day the lot started in the fab. |
| `cmpl_dt` | The day the lot finished. `NULL` while the lot is in process. |
| `strt_qty` | Pieces started. |
| `good_qty` | Pieces that passed test. |
| `yld_bp` | Yield in basis points. |

Assembly and test sites are `PH04` in the Philippines, `MY05` in Malaysia and `CN06`
in Chengdu. Fab sites are listed in [Part numbering](part-numbering.md).

`yld_bp` is basis points, so 9104 is 91.04 percent. It equals
`good_qty * 10000 / strt_qty`, and either source gives the same answer.

| lot_stat_cd | Meaning |
|---|---|
| `WP` | Work in process. `cmpl_dt` is `NULL` and `good_qty` is a forecast. |
| `CP` | Complete. |
| `HD` | On engineering hold. Complete but not released to stock. |
| `SC` | Scrapped. `good_qty` and `yld_bp` are both zero. |

**A yield average must exclude `SC` lots.** A scrapped lot stores zero yield, and
including those zeros pulls a family average down by several points. It must also
exclude `WP` lots, whose yield is not final.

```sql
SELECT p.fam_cd, AVG(m.yld_bp) / 100.0 AS yield_pct
FROM lot_mstr m
JOIN part_mstr p ON p.part_no = m.part_no
WHERE m.lot_stat_cd = 'CP'
GROUP BY p.fam_cd
ORDER BY yield_pct;
```

## Lots on a shipment

`shpmt_ln.lot_id` names the lot the shipped pieces came from, and it joins to
`lot_mstr.lot_id`. This is the only traceability path in the extract: from a customer
back to a fab site and an assembly site.

One shipment line names one lot. A real shipment can draw from two lots, and the
extract keeps only the first, so the trace is indicative and not an audit record.

## Related pages

- [Table directory](table-directory.md)
- [Part numbering](part-numbering.md)
- [Shipping and invoicing](shipping-and-invoicing.md)
- [Amounts and units](amounts-and-units.md)
