# Customer master (cust_mstr, cust_addr, cust_ctct)

Owner: Order Management Systems (Dan Whitfield)
Source: Vantera ERP, nightly extract
Last reviewed: 2026-06-30

`cust_mstr` holds one row per sold-to account. An account gets created when Finance
approves a credit application, and once created it stays forever. Rows are never
physically deleted, which is deliberate: it means a fifteen year old order still
resolves to a customer name. It also means the table carries a fair amount of
sediment, and most of this page is about telling the sediment from the customers.

## Customer type (cst_typ_cd)

Two characters. Set at account creation, and changed only through a Finance ticket,
so it is reliable.

| cst_typ_cd | Meaning |
|---|---|
| `01` | Authorized distributor. Buys for resale and holds stock. |
| `02` | OEM direct. Buys for its own products. |
| `03` | Contract manufacturer. Builds boards on behalf of an OEM. |
| `04` | Intercompany. A Vantera legal entity, not an external customer. |

Pay attention to `04`. Those accounts are Vantera's own regional subsidiaries:
Vantera Semiconductor Europe GmbH, Vantera Semiconductor Japan KK and Vantera
Semiconductor Asia Pte Ltd. Their orders are internal transfers, not sales.

Leave them out of any revenue, bookings or customer-count figure. Including them
double counts, because the subsidiary turns around and invoices the end customer
separately in its own ledger, and that invoice is the one that becomes group
revenue.

`code_lkp` also lists `cst_typ_cd` of `05`, government and defense prime. Vantera
retired that code in 2018 and no account carries it.

## Account status (stat_cd)

One character.

| stat_cd | Meaning |
|---|---|
| `A` | Active. Normal terms. |
| `H` | Credit hold. Still an active customer. |
| `I` | Inactive. No longer trading with Vantera. |

`H` is the code people read wrong, every time, without fail.

A customer on credit hold is active. What Finance has done is suspend net terms, so
new orders ship against prepayment. The account still trades, still receives goods,
and its shipped and invoiced orders are real revenue that has already been collected,
usually before shipment.

Do not filter `stat_cd = 'H'` out of a revenue or customer-count query. Filter it
only when the question is genuinely about open credit lines or payment terms.

`I` means the relationship ended. Old orders stay in `ord_hdr` and stay countable in
historical periods, which is what you want.

## Deletion flag (del_flg)

One character, `Y` or `N`. `Y` marks a row that was logically deleted. In practice
that is almost always a duplicate account somebody created by mistake during
onboarding, or an account merged into another one after an acquisition. Nothing
purges these rows and nothing ever will.

So: every query against `cust_mstr` needs `del_flg = 'N'`, unless the query is an
audit of the deletions themselves. Orders belonging to a deleted customer are
excluded from reporting too.

## Region (rgn_cd)

Four characters: `AMER`, `EMEA`, `APAC`, `JAPN`.

Japan is reported separately from the rest of Asia Pacific for historical reasons
that nobody here can fully reconstruct, so `APAC` never includes Japan. Do not
"helpfully" merge them.

One thing `rgn_cd` is not: it is the region of the account, not the region that ships
the goods and not the sales region that owns the account. For those, use
`shpmt_hdr.whs_cd` and `cust_terr_asgn` respectively.

## Corporate hierarchy (corp_cust_id)

`corp_cust_id` names the parent account, and it is `NULL` on a parent. The hierarchy
is one level deep by design: a child never has a child of its own, so you never need
a recursive query here.

For example, `Redstone Components Europe BV` and `Redstone Components Asia Ltd` both
carry `corp_cust_id = 1001`, which is `Redstone Components Inc`.

Each account buys on its own paper and pays its own invoices, so revenue for a single
account uses `cust_id` alone. A question about the whole corporate group needs both
the parent and its children:

```sql
WHERE h.cust_id IN (
    SELECT cust_id FROM cust_mstr
    WHERE cust_id = 1001 OR corp_cust_id = 1001
)
```

Note the `OR`. A group total that reads only the parent row understates the group,
sometimes badly. `Redstone Components Inc` on its own is about three quarters of what
the three Redstone accounts book together.

## Payment terms (terms_cd) and credit limit (cr_lmt_amt)

`terms_cd` joins to `pay_terms.terms_cd`. `pay_terms.net_days` is the number of days
from the invoice date to the due date, and the nightly load uses it to fill
`invc_hdr.due_dt`.

`pay_terms.disc_bp` is an early payment discount in basis points, taken when the
customer pays inside `disc_days`. Terms `2T10` is 200 basis points, that is 2.00
percent, if the customer pays inside 10 days.

Important caveat: the extract records no early payment discount that a customer
actually took. `disc_bp` describes the offer and nothing else. If someone asks how
much we gave away in early payment discounts last year, this data cannot answer it.

Two patterns worth knowing, both of which look like bugs and are not:

- Every credit-hold account carries terms `PPAY`, prepayment before shipment.
- Every inactive account and every intercompany account carries `cr_lmt_amt = 0`. A
  zero credit limit on those rows is correct.

## Addresses (cust_addr)

`cust_addr` holds one row per address, keyed by `cust_id` and `addr_seq`. An account
has at least a bill-to row and a ship-to row, and a large account can have a dozen
ship-to rows.

| addr_typ_cd | Meaning |
|---|---|
| `BT` | Bill to. The invoice address. |
| `ST` | Ship to. A dock that receives goods. |
| `SD` | Sold to. The legal contracting address. No account uses this code today. |

`dflt_flg = 'Y'` marks the address the order entry screen offers first, one per
address type. `actv_flg = 'N'` marks an address that closed. A closed address stays
in the table, because old orders point at it.

**A join to `cust_addr` needs both keys.** This is the single most expensive mistake
on this page. `ord_hdr.shp_to_seq` and `ord_hdr.bil_to_seq` name the exact address
the order used:

```sql
JOIN cust_addr sa ON sa.cust_id = h.cust_id AND sa.addr_seq = h.shp_to_seq
JOIN cust_addr ba ON ba.cust_id = h.cust_id AND ba.addr_seq = h.bil_to_seq
```

Join on `cust_id` alone and you multiply every order row by the number of addresses
that account holds. A revenue total then reads two to four times too high, and it
scales with account size, so the biggest customers get the biggest error. Nothing in
the schema stops you, because the extract carries no keys.

## Contacts (cust_ctct)

`cust_ctct` holds one row per person, keyed by `cust_id` and `ctct_seq`.

| role_cd | Meaning |
|---|---|
| `BUYR` | Buyer. Places the purchase order. |
| `ENGR` | Design engineer. Chooses the part. |
| `ACPY` | Accounts payable. Pays the invoice. |
| `QUAL` | Quality engineer. Signs off a failure analysis. |

`actv_flg = 'N'` marks a person who left. Every account has exactly one `BUYR` row.
The other roles are present only where somebody at Vantera bothered to record them,
so coverage is patchy.

Same warning as addresses: a join to `cust_ctct` multiplies rows the same way
`cust_addr` does. Filter `role_cd`.

## Related pages

- [Table directory](table-directory.md)
- [Order tables](order-tables.md)
- [Sales territories](sales-territories.md)
- [Revenue reporting](revenue-reporting.md)
