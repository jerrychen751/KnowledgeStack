import type { ReactNode } from "react";

import styles from "./ui.module.css";

/** The tick a Copy button shows for two seconds after it writes a value to the clipboard. The stroke takes the colour of the label beside it. */
export function CheckMark(): ReactNode {
  return (
    <svg className={styles.checkMark} viewBox="0 0 16 16" aria-hidden="true">
      <path
        d="M3.25 8.5 6.4 11.65 12.75 5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
