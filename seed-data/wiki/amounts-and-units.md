# Amounts and units

Owner: Finance Systems (Priya Raghavan)
Last reviewed: 2026-06-11

Read this page before you write anything that adds up money.

Every money column in the order extract is an integer. There are no decimals
anywhere, and the money columns do not all use the same scale. That second part is
what gets people. We field a ticket about it roughly once a month, and it is almost
always the same ticket: a number came out exactly 100 times too big and nobody
noticed until it reached a slide.

## The money scales

| Column | Type | Scale | Example stored value | Real value |
|---|---|---|---|---|
| `ord_hdr.tot_amt` | bigint | cents, value x 100 | `2273500` | 22,735.00 USD |
| `ord_ln.unit_px` | bigint | hundredths of a cent, value x 10000 | `8200` | 0.8200 USD |
| `ord_ln.lst_px` | bigint | hundredths of a cent, value x 10000 | `8860` | 0.8860 USD |
| `price_lst.lst_px` | bigint | hundredths of a cent, value x 10000 | `460` | 0.0460 USD |
| `part_mstr.std_cost` | bigint | hundredths of a cent, value x 10000 | `3280` | 0.3280 USD |
| `invc_hdr.invc_amt` | bigint | cents, value x 100 | `3364000` | 33,640.00 USD |
| `invc_hdr.tax_amt` | bigint | cents, value x 100 | `277530` | 2,775.30 USD |
| `invc_hdr.paid_amt` | bigint | cents, value x 100 | `3641530` | 36,415.30 USD |
| `invc_ln.ext_amt` | bigint | cents, value x 100 | `984000` | 9,840.00 USD |
| `shpmt_hdr.frt_amt` | bigint | cents, value x 100 | `49909` | 499.09 USD |
| `cust_mstr.cr_lmt_amt` | bigint | cents, value x 100 | `750000000` | 7,500,000.00 USD |
| `ord_hdr_hist.tot_amt_usd` | integer | whole US dollars, no multiplier | `20830` | 20,830.00 USD |

The pattern, once you see it: header and invoice columns hold cents. Line and part
columns hold hundredths of a cent.

There is a real reason for the split, even if it looks arbitrary from the outside.
Component prices need four decimal places. A logic gate sells at 0.0370 USD in reel
quantity. Cents cannot hold that, and rounding to cents turns a 120,000 piece line
into a total that is wrong by hundreds of dollars. So the line columns got the extra
two digits and the header columns did not.

What makes this genuinely hard is that nothing in the schema signals the difference.
Every column is `bigint`. There are no column comments. The names give you nothing.
A query that treats `unit_px` as cents reports a price 100 times too high and runs
without complaint. Check this page before writing any calculation over a money
column, every time, including the times you are sure you remember.

And then there is the archive.

`ord_hdr_hist.tot_amt_usd` is the exception that breaks every rule above. It holds
whole dollars. No multiplier at all. So a UNION with `ord_hdr.tot_amt` understates
the archive by a factor of 100, which is the same 100 as everywhere else on this
page but pointing the other way. See
[Order history archive](order-history-archive.md).

## Converting

To dollars:

- cents columns: `value / 100.0`
- hundredths of a cent columns: `value / 10000.0`
- `ord_hdr_hist.tot_amt_usd`: no conversion

Extended value of one order line, in cents:

- `qty * unit_px / 100`

Keep the `.0`. Integer division will quietly truncate and you will lose the cents.

## Header total is derived

`ord_hdr.tot_amt` is recalculated by the nightly load as the sum of its lines. Nobody
keys it by hand, and nobody has since the 2019 cutover:

```
tot_amt = sum(qty * unit_px) / 100
```

Either source gives the same answer. Summing `tot_amt` over headers is cheaper than
summing lines, and it is the normal way to total an order set. Go down to the lines
only when the question needs a breakdown by part number or by part family.

One caveat worth remembering: `tot_amt` uses the ordered quantity, not the shipped
quantity. When an order ships short, the invoice comes in smaller than `tot_amt`, and
the two figures will not reconcile no matter how long you stare at them. See
[Shipping and invoicing](shipping-and-invoicing.md).

## Basis points

Three columns hold a rate in basis points. One basis point is 0.01 percent, so
10000 basis points is 100 percent.

| Column | Example stored value | Real value |
|---|---|---|
| `lot_mstr.yld_bp` | `9104` | 91.04 percent yield |
| `pay_terms.disc_bp` | `200` | 2.00 percent early payment discount |

Divide by 100 for a percentage. Divide by 10000 for a fraction. Getting these two
backwards is less costly than the money scales, but a 9104 percent yield on a chart
does tend to attract attention.

## Quantity

`ord_ln.qty` is a piece count. Not a reel count, not a tray count. Order quantities
look enormous for that reason: parts ship on tape and reel, and a 3,000 piece minimum
is one reel.

`part_mstr.moq` holds the minimum order quantity in pieces, and `pkg_mstr.reel_qty`
holds the pieces on one reel or tray for that package.

`qty` is negative on a return order. See [Returns and RMA](returns-and-rma.md).

## Currency

`ord_hdr.curr_cd` and `invc_hdr.curr_cd` are `USD` on every row. Vantera bills all
regions in US dollars, including EMEA and Japan. No conversion is needed and no rate
table exists. If you find yourself looking for one, you are looking for something
that was never built.

## Related pages

- [Table directory](table-directory.md)
- [Order tables](order-tables.md)
- [Revenue reporting](revenue-reporting.md)
- [Pricing and the price list](pricing-and-price-list.md)
- [Shipping and invoicing](shipping-and-invoicing.md)
