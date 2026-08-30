# Customer master (cust_mstr, cust_addr, cust_ctct)

Owner: Order Management Systems
Source: Vantera ERP, nightly extract
Last reviewed: 2026-06-30

`cust_mstr` holds one row per sold-to account. An account is created when Finance
approves a credit application. Rows are never physically deleted, so historical
orders always resolve to a customer name.

## Customer type (cst_typ_cd)

Two characters. The code is set at account creation and changes only through a
Finance ticket.

| cst_typ_cd | Meaning |
|---|---|
| `01` | Authorized distributor. Buys for resale and holds stock. |
| `02` | OEM direct. Buys for its own products. |
| `03` | Contract manufacturer. Builds boards on behalf of an OEM. |
| `04` | Intercompany. A Vantera legal entity, not an external customer. |

Type `04` accounts are Vantera's own regional subsidiaries: Vantera Semiconductor
Europe GmbH, Vantera Semiconductor Japan KK and Vantera Semiconductor Asia Pte Ltd.
Their orders are internal transfers, not sales. Leave them out of any revenue,
bookings or customer-count figure. Including them double counts, because the
subsidiary invoices the end customer separately in its own ledger.

`code_lkp` also lists `cst_typ_cd` of `05`, government and defense prime. Vantera
retired that code in 2018 and no account carries it.

## Account status (stat_cd)

One character.

| stat_cd | Meaning |
|---|---|
| `A` | Active. Normal terms. |
| `H` | Credit hold. Still an active customer. |
| `I` | Inactive. No longer trading with Vantera. |

`H` is the code people read wrong. A customer on credit hold is active. Finance has
suspended net terms, so new orders ship against prepayment, but the account trades,
and its shipped and invoiced orders are real revenue. Do not filter `stat_cd = 'H'`
out of a revenue or customer-count query. Filter it only when the question is about
open credit lines or payment terms.

`I` means the relationship ended. Old orders stay in `ord_hdr` and stay countable in
historical periods.

## Deletion flag (del_flg)

One character, `Y` or `N`. `Y` marks a row that was logically deleted, almost always
a duplicate account created by mistake during onboarding, or an account merged into
another after an acquisition. Nothing purges these rows.

Every query against `cust_mstr` needs `del_flg = 'N'` unless it is an audit of the
deletions themselves. Orders belonging to a deleted customer are also excluded from
reporting.

## Region (rgn_cd)

Four characters: `AMER`, `EMEA`, `APAC`, `JAPN`. Japan is reported separately from
the rest of Asia Pacific for historical reasons, so `APAC` never includes Japan.

`rgn_cd` is the region of the account. It is not the region that ships the goods and
it is not the sales region that owns the account. Use `shpmt_hdr.whs_cd` for the
first and `cust_terr_asgn` for the second.

## Corporate hierarchy (corp_cust_id)

`corp_cust_id` names the parent account, and it is `NULL` on a parent. The hierarchy
is one level deep: a child never has a child of its own.

Example: `Redstone Components Europe BV` and `Redstone Components Asia Ltd` both
carry `corp_cust_id = 1001`, which is `Redstone Components Inc`.

Each account buys on its own paper and pays its own invoices, so revenue for one
account uses `cust_id` alone. A question about a corporate group needs both the
parent and its children:

```sql
WHERE h.cust_id IN (
    SELECT cust_id FROM cust_mstr
    WHERE cust_id = 1001 OR corp_cust_id = 1001
)
```

A group total that reads only the parent row understates the group. `Redstone
Components Inc` alone is about three quarters of what the three Redstone accounts
book together.

## Payment terms (terms_cd) and credit limit (cr_lmt_amt)

`terms_cd` joins to `pay_terms.terms_cd`. `pay_terms.net_days` is the number of days
from the invoice date to the due date, and the nightly load uses it to fill
`invc_hdr.due_dt`.

`pay_terms.disc_bp` is an early payment discount in basis points, taken when the
customer pays inside `disc_days`. Terms `2T10` is 200 basis points, that is 2.00
percent, if the customer pays inside 10 days. The extract records no early payment
discount that a customer actually took, so `disc_bp` describes the offer only.

Every credit-hold account carries terms `PPAY`, prepayment before shipment.
Every inactive account and every intercompany account carries `cr_lmt_amt = 0`.
A zero credit limit is not a data fault.

## Addresses (cust_addr)

`cust_addr` holds one row per address, keyed by `cust_id` and `addr_seq`. An account
has at least a bill-to row and a ship-to row, and a large account has several
ship-to rows.

| addr_typ_cd | Meaning |
|---|---|
| `BT` | Bill to. The invoice address. |
| `ST` | Ship to. A dock that receives goods. |
| `SD` | Sold to. The legal contracting address. No account uses this code today. |

`dflt_flg = 'Y'` marks the address the order entry screen offers first, one per
address type. `actv_flg = 'N'` marks an address that closed. A closed address stays,
because old orders point at it.

**A join to `cust_addr` needs both keys.** `ord_hdr.shp_to_seq` and
`ord_hdr.bil_to_seq` name the exact address the order used:

```sql
JOIN cust_addr sa ON sa.cust_id = h.cust_id AND sa.addr_seq = h.shp_to_seq
JOIN cust_addr ba ON ba.cust_id = h.cust_id AND ba.addr_seq = h.bil_to_seq
```

A join on `cust_id` alone multiplies every order row by the number of addresses the
account holds, and a revenue total then reads two to four times too high. Nothing in
the schema stops this, because the extract carries no keys.

## Contacts (cust_ctct)

`cust_ctct` holds one row per person, keyed by `cust_id` and `ctct_seq`.

| role_cd | Meaning |
|---|---|
| `BUYR` | Buyer. Places the purchase order. |
| `ENGR` | Design engineer. Chooses the part. |
| `ACPY` | Accounts payable. Pays the invoice. |
| `QUAL` | Quality engineer. Signs off a failure analysis. |

`actv_flg = 'N'` marks a person who left. Every account has exactly one `BUYR` row,
and the other roles are present only where Vantera recorded them. A join to
`cust_ctct` multiplies rows in the same way `cust_addr` does, so filter `role_cd`.

## Related pages

- [Table directory](table-directory.md)
- [Order tables](order-tables.md)
- [Sales territories](sales-territories.md)
- [Revenue reporting](revenue-reporting.md)
