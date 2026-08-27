import type { ReactNode } from "react";

import styles from "./ui.module.css";

/** The small uppercase heading that names a section, a card field, or a rail. `as` picks the element: a `span` sits beside its siblings, and a `p` starts its own line. */
export function Label({
  as = "span",
  children,
}: {
  as?: "p" | "span";
  children: ReactNode;
}): ReactNode {
  const Tag = as;
  return <Tag className={styles.label}>{children}</Tag>;
}
