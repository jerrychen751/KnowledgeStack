import type { ReactNode } from "react";

import { Label } from "./label";
import styles from "./ui.module.css";

/** One band of a page: an uppercase label, an optional element on the right of that label, and the body under both. */
export function Section({
  label,
  aside,
  children,
}: {
  label: string;
  aside?: ReactNode;
  children: ReactNode;
}): ReactNode {
  return (
    <section className={styles.section}>
      <div className={styles.sectionHead}>
        <Label as="p">{label}</Label>
        {aside}
      </div>
      {children}
    </section>
  );
}
