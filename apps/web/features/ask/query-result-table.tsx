import { useMemo, useState, type ReactNode } from "react";
import { format } from "sql-formatter";

import styles from "./ask.module.css";
import type { QueryResult } from "@knowledgestack/api-contract/chat";

/** One result set of a database query, under the tool steps of the turn that ran it. The header opens and closes the statement the model wrote, and the table scrolls sideways when the row is wider than the thread. */
export function QueryResultTable({ result }: { result: QueryResult }): ReactNode {
  const [isSqlOpen, setIsSqlOpen] = useState(false);

  const paintedSql = useMemo(() => {
    try {
      const formatted = format(result.sql, { language: "postgresql", keywordCase: "upper" });
      return highlightSql(collapseShortExpressions(formatted));
    } catch {
      return highlightSql(result.sql);
    }
  }, [result.sql]);

  return (
    <div className={styles.queryResult}>
      <button
        type="button"
        className={styles.queryHead}
        onClick={() => setIsSqlOpen((previous) => !previous)}
        aria-expanded={isSqlOpen}
      >
        <span className={styles.queryLabel}>{result.database}</span>
        <span className={styles.queryCount}>
          {result.rows.length} row{result.rows.length === 1 ? "" : "s"}
        </span>
        <span className={styles.querySqlToggle}>{isSqlOpen ? "hide sql" : "show sql"}</span>
      </button>
      {isSqlOpen ? <pre className={styles.querySql}>{paintedSql}</pre> : null}
      {result.rows.length === 0 ? (
        <p className={styles.queryEmpty}>The query matched no row.</p>
      ) : (
        <div className={styles.queryScroll}>
          <table className={styles.queryTable}>
            <thead>
              <tr>
                {result.columns.map((column, columnPosition) => (
                  <th key={columnPosition} scope="col">
                    {column}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {result.rows.map((row, rowPosition) => (
                <tr key={rowPosition}>
                  {row.map((value, columnPosition) => (
                    <td key={columnPosition}>{value}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
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
function highlightSql(sql: string): ReactNode[] {
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

  return pieces.map((piece, position) => {
    if (position % 2 === 0 || piece === "") {
      return piece;
    }
    if (piece.startsWith("'")) {
      return (
        <span key={position} className={styles.querySqlString}>
          {piece}
        </span>
      );
    }
    if (piece.startsWith("--")) {
      return (
        <span key={position} className={styles.querySqlComment}>
          {piece}
        </span>
      );
    }
    if (/^\d/.test(piece)) {
      return (
        <span key={position} className={styles.querySqlNumber}>
          {piece}
        </span>
      );
    }
    if (keywords.has(piece.toLowerCase())) {
      return (
        <span key={position} className={styles.querySqlKeyword}>
          {piece}
        </span>
      );
    }
    return piece;
  });
}
