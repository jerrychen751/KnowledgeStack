# Part numbering and the part master (part_mstr)

Owner: Product Line Marketing
Last reviewed: 2026-03-09

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
`VI` interface, `VD` data converters, `VL` logic.

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

There is no lookup table for `fam_cd` in the extract. This page is the mapping.

## Package code (pkg_cd)

`pkg_cd` repeats the suffix of the part number as its own column. Common values are
`DR` and `DBVR` for small-outline and SOT-23 packages, `PWR` for TSSOP, `RGTR` and
`RHBR` for QFN, `IPM` and `IPN` for LQFP, and `ZCE` for ball grid array.

## Lead time and minimum order quantity

`lt_wks` is the quoted lead time in weeks, from order to ship. Values between 8 and
30 weeks are normal for this business, and a long lead time is not a defect.

`moq` is the minimum order quantity in pieces, set by the reel or tray size for the
package. It is not a customer-specific value.

## Compliance and lifecycle flags

`rohs_flg` is `Y` when the part meets RoHS. A small number of legacy parts carry `N`
and can only be sold into exempt applications.

`eol_flg` is `Y` when the part is end of life. An end-of-life part still accepts
last-time-buy orders, so `eol_flg = 'Y'` rows still appear in recent orders. Do not
treat the flag as a filter for historical reporting.

## Related pages

- [Order tables](order-tables.md)
- [Revenue reporting](revenue-reporting.md)
