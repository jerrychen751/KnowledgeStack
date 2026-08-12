# Customer master (cust_mstr)

Owner: Order Management Systems
Source: Vantera ERP, nightly extract
Last reviewed: 2026-05-18

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

## Related pages

- [Order tables](order-tables.md)
- [Revenue reporting](revenue-reporting.md)
