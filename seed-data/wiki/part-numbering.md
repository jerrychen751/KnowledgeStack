# Part numbering and the part master (part_mstr, pkg_mstr, part_xref)

Owner: Product Line Marketing
Last reviewed: 2026-06-30

`part_mstr` holds one row per orderable part number. A part number identifies a
die, a package and a shipping medium together, so the same silicon appears under
several part numbers.

## Reading a part number

`VP5433DDAR` breaks into three fields:

| Field | Example | Meaning |
|---|---|---|
| Prefix, two letters | `VP` | Product line |
| Base number, four digits | `5433` | The device |
| Suffix | `DDAR` | Package and shipping medium |

Prefixes are `VA` amplifiers, `VP` power, `VM` microcontrollers and processors,
`VI` interface, `VD` data converters, `VL` logic, `VC` clocks and timing, and
`VS` sensors.

A trailing `R` on the suffix means tape and reel. The same device in tube or tray
drops the `R`. `VP5433DDA` and `VP5433DDAR` are the same silicon in the same
package. Only the reel version is stocked.

## Family code (fam_cd)

Two digits. `fam_cd` is the reporting hierarchy, and it is what Finance groups by.
It does not always agree with the part number prefix, because the prefix is a
marketing decision and `fam_cd` is a cost-center decision.

| fam_cd | Product family |
|---|---|
| `07` | Amplifiers and comparators |
| `12` | Power management |
| `23` | Microcontrollers and processors |
| `31` | Interface |
| `44` | Data converters |
| `58` | Logic |
| `66` | Clocks and timing |
| `72` | Sensing products |

There is no lookup table for `fam_cd` in the extract, and `code_lkp` does not carry
it either. This page is the mapping.

## Package code (pkg_cd)

`pkg_cd` repeats the suffix of the part number as its own column, and it joins to
`pkg_mstr.pkg_cd`. `pkg_mstr` is the one code table the extract does carry for
packages.

| pkg_mstr column | Meaning |
|---|---|
| `pkg_desc` | The package name, such as `SOIC narrow body, tape and reel` |
| `pin_cnt` | The lead count |
| `reel_qty` | Pieces on one reel, tray or tube |
| `mnt_typ_cd` | `SMT` surface mount or `THT` through hole |

`part_mstr.moq` normally equals `pkg_mstr.reel_qty` for that package, because the
minimum order is one reel. The two columns are stored separately and a product line
can override `moq`, so they do not always agree.

## Lead time and minimum order quantity

`lt_wks` is the quoted lead time in weeks, from order to ship. Values between 8 and
34 weeks are normal for this business, and a long lead time is not a defect. The
order entry screen fills `ord_ln.sched_dt` with `ord_dt + lt_wks * 7`.

`moq` is the minimum order quantity in pieces, set by the reel or tray size for the
package. It is not a customer-specific value.

## Standard cost (std_cost)

`std_cost` is the manufacturing cost of one piece, in hundredths of a cent, the same
scale as `ord_ln.unit_px`. It is a standard cost set once a year by Cost Accounting,
not an actual cost, and it does not move with yield.

Gross margin on one order line, in hundredths of a cent:

```sql
SELECT l.ord_id, l.ln_no,
       l.qty * (l.unit_px - p.std_cost) AS margin_hundredths_of_cent
FROM ord_ln l
JOIN part_mstr p ON p.part_no = l.part_no;
```

Divide by 10000 for dollars. See [Amounts and units](amounts-and-units.md).

## Compliance and lifecycle flags

`rohs_flg` is `Y` when the part meets RoHS. A small number of legacy parts carry `N`
and can only be sold into exempt applications.

`eol_flg` is `Y` when the part is end of life. An end-of-life part still accepts
last-time-buy orders, so `eol_flg = 'Y'` rows still appear in recent orders. Do not
treat the flag as a filter for historical reporting.

`succ_part_no` names the part that replaces an end-of-life part, and it is `NULL`
on every part that is not end of life. It points at a row in `part_mstr`, so a
question about a replacement is a self-join:

```sql
SELECT p.part_no, p.part_desc, s.part_no AS successor, s.part_desc
FROM part_mstr p
JOIN part_mstr s ON s.part_no = p.succ_part_no
WHERE p.eol_flg = 'Y';
```

## Qualification level (qual_cd)

Three characters.

| qual_cd | Meaning |
|---|---|
| `STD` | Standard commercial qualification. |
| `AEC` | AEC-Q100 automotive qualification. |
| `MIL` | Military temperature range screening. |

An automotive customer can only buy `AEC` parts for a vehicle programme. The extract
does not record what a customer did with a part, so `qual_cd` describes the part and
never the order.

## Manufacturing site (fab_site_cd)

`fab_site_cd` is the wafer fab that makes the die.

| fab_site_cd | Site |
|---|---|
| `TX01` | Dallas, Texas |
| `ME02` | South Portland, Maine |
| `AI03` | Aizu, Japan |

`part_mstr.fab_site_cd` is the fab. Assembly and test happen elsewhere, and
`lot_mstr.asy_site_cd` names that site per lot. See
[Inventory and lots](inventory-and-lots.md).

## Customer part numbers (part_xref)

A customer orders under its own part number, and `part_xref` maps that number to a
Vantera part number. The key is `cust_id` plus `cust_part_no`.

Two facts about this table decide every query against it.

- A customer part number is unique inside one account only. `HAS-40-11872` maps to
  `VI1051DR` for Halcyon Automotive Systems and to `VI1044ADR` for Halcyon
  Automotive de Mexico. A lookup without `cust_id` returns both rows.
- `actv_flg = 'N'` marks a mapping that the customer retired. The row stays, because
  old purchase orders still quote that number.

`ord_ln` carries the Vantera part number only. A question phrased with a customer
part number resolves through `part_xref` first.

## Related pages

- [Table directory](table-directory.md)
- [Order tables](order-tables.md)
- [Inventory and lots](inventory-and-lots.md)
- [Revenue reporting](revenue-reporting.md)
