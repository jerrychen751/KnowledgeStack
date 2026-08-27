import type { ReactNode } from "react";

import styles from "./ui.module.css";

/** The dashed placeholder a section shows in place of a list that holds nothing. */
export function EmptyState({ children }: { children: ReactNode }): ReactNode {
  return <p className={styles.empty}>{children}</p>;
}
