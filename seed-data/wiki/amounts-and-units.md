# Amounts and units

Owner: Finance Systems
Last reviewed: 2026-06-11

Every money column in the order extract is an integer. There are no decimals
anywhere, and the two money columns do not use the same scale.

## The two scales

| Column | Type | Scale | Example stored value | Real value |
|---|---|---|---|---|
| `ord_hdr.tot_amt` | bigint | cents, value x 100 | `18492500` | 184,925.00 USD |
| `ord_ln.unit_px` | bigint | hundredths of a cent, value x 10000 | `8200` | 0.8200 USD |

`tot_amt` is in cents, the same as the rest of the finance warehouse.

`unit_px` is in hundredths of a cent because component prices need four decimal
places. A logic gate sells at 0.0037 USD in reel quantity. Cents cannot hold that,
and rounding to cents turns a 120,000 piece line into a total that is wrong by
hundreds of dollars.

A query that treats `unit_px` as cents reports a price 100 times too high. Nothing
in the schema signals the difference, so check this page before writing any
calculation over `unit_px`.

## Converting

To dollars:

- `tot_amt / 100.0`
- `unit_px / 10000.0`

Extended value of one order line, in cents:

- `qty * unit_px / 100`

## Header total is derived

`ord_hdr.tot_amt` is recalculated by the nightly load as the sum of its lines. It is
never keyed by hand:

```
tot_amt = sum(qty * unit_px) / 100
```

Either source gives the same answer. Summing `tot_amt` over headers is cheaper than
summing lines, and it is the normal way to total an order set. Sum the lines only
when the question needs a breakdown by part number or by part family.

## Currency

`ord_hdr.curr_cd` is `USD` on every row. Vantera bills all regions in US dollars,
including EMEA and Japan. No conversion is needed and no rate table exists.

## Quantity

`ord_ln.qty` is a piece count, not a reel count or a tray count. Order quantities are
large because parts ship on tape and reel: a 3,000 piece minimum is one reel.
`part_mstr.moq` holds the minimum order quantity in pieces.

## Related pages

- [Order tables](order-tables.md)
- [Revenue reporting](revenue-reporting.md)
