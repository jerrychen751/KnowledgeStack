import { useState, type ReactNode } from "react";

import styles from "./ask.module.css";
import type { QueryResult } from "@knowledgestack/api-contract/chat";

/** One result set of a database query, under the tool steps of the turn that ran it. The header opens and closes the statement the model wrote, and the table scrolls sideways when the row is wider than the thread. */
export function QueryResultTable({ result }: { result: QueryResult }): ReactNode {
  const [isSqlOpen, setIsSqlOpen] = useState(false);

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
      {isSqlOpen ? <pre className={styles.querySql}>{result.sql}</pre> : null}
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
