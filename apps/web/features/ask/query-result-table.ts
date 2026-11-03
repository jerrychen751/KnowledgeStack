import { Component, computed, input, signal } from "@angular/core";
import { format } from "sql-formatter";

import type { QueryResult } from "@knowledgestack/api-contract/chat";

/** One result set of a database query, under the tool steps of the turn that ran it. The header opens and closes the statement the model wrote, and the table scrolls sideways when the row is wider than the thread. */
@Component({
  selector: "div[ksQueryResultTable]",
  host: { class: "ask-query-result" },
  templateUrl: "./query-result-table.html",
})
export class QueryResultTable {
  readonly result = input.required<QueryResult>();
  protected readonly isSqlOpen = signal(false);
  protected readonly paintedSql = computed(() => {
    const sql = this.result().sql;
    try {
      const formatted = format(sql, { language: "postgresql", keywordCase: "upper" });
      return highlightSql(collapseShortExpressions(formatted));
    } catch {
      return highlightSql(sql);
    }
  });
}

/** The statement with every short parenthesised expression folded back onto one line. `sql-formatter` reads the `FROM` of `EXTRACT(QUARTER FROM ord_dt)` as a clause and breaks that one call across four lines. A group that holds a comma or a `--` comment keeps its one item per line, because folding either one changes what the statement says. */
function collapseShortExpressions(sql: string): string {
  const literals: string[] = [];
  const masked = sql.replace(/'(?:[^']|'')*'/g, (literal) => {
    literals.push(literal);
    return `\u0000${literals.length - 1}\u0000`;
  });

  let folded = masked;
  for (;;) {
    const next = folded.replace(/\(([^()]*)\)/g, (whole, inside: string) => {
      if (!inside.includes("\n") || inside.includes(",") || inside.includes("--")) {
        return whole;
      }
      const oneLine = `(${inside.trim().replace(/\s+/g, " ")})`;
      return oneLine.length <= 60 ? oneLine : whole;
    });
    if (next === folded) {
      break;
    }
    folded = next;
  }

  return folded.replace(/\u0000(\d+)\u0000/g, (_, position: string) => literals[Number(position)] ?? "");
}

/** The statement, split into one coloured span per keyword, string, number and comment, with plain text between the spans. */
function highlightSql(sql: string): { text: string; className: string | null }[] {
  const keywords = new Set([
    "all", "and", "any", "as", "asc", "between", "by", "case", "cast", "coalesce", "cross",
    "current", "desc", "distinct", "else", "end", "except", "exists", "extract", "filter",
    "first", "following", "from", "full", "group", "having", "ilike", "in", "inner",
    "intersect", "interval", "is", "join", "last", "lateral", "left", "like", "limit", "not",
    "null", "nullif", "nulls", "offset", "on", "or", "order", "outer", "over", "partition",
    "preceding", "range", "recursive", "right", "row", "rows", "select", "then", "unbounded",
    "union", "using", "when", "where", "with", "within",
  ]);
  const pieces = sql.split(/('(?:[^']|'')*'|--[^\n]*|\b\d+(?:\.\d+)?\b|[A-Za-z_][A-Za-z_0-9]*)/);

  return pieces
    .map((piece, position) => {
      if (position % 2 === 0 || piece === "") {
        return { text: piece, className: null };
      }
      if (piece.startsWith("'")) {
        return { text: piece, className: "ask-query-sql-string" };
      }
      if (piece.startsWith("--")) {
        return { text: piece, className: "ask-query-sql-comment" };
      }
      if (/^\d/.test(piece)) {
        return { text: piece, className: "ask-query-sql-number" };
      }
      if (keywords.has(piece.toLowerCase())) {
        return { text: piece, className: "ask-query-sql-keyword" };
      }
      return { text: piece, className: null };
    })
    .filter((piece) => piece.text !== "");
}
