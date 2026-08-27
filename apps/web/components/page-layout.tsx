import type { ReactNode } from "react";

import type { Notice } from "@/lib/use-page-request";

import styles from "./ui.module.css";

/** The frame every list page shares: the centred column, the title, the subtitle, and the notice line under them. Pass `notice` straight from `usePageRequest`; a null value renders no line. */
export function PageLayout({
  title,
  subtitle,
  notice,
  children,
}: {
  title: string;
  subtitle: string;
  notice: Notice | null;
  children: ReactNode;
}): ReactNode {
  return (
    <div className={styles.page}>
      <header className={styles.pageHead}>
        <h1 className={styles.title}>{title}</h1>
        <p className={styles.subtitle}>{subtitle}</p>
      </header>

      {notice === null ? null : (
        <p className={`${styles.notice} ${notice.failed ? styles.noticeFailure : ""}`}>
          {notice.text}
        </p>
      )}

      {children}
    </div>
  );
}
