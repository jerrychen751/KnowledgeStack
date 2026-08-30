import type { ReactNode } from "react";

import { SettingsNav } from "@/features/settings/settings-nav";
import styles from "@/features/settings/settings.module.css";

export default function SettingsLayout({ children }: { children: ReactNode }): ReactNode {
  return (
    <div className={styles.layout}>
      <SettingsNav />
      <div>{children}</div>
    </div>
  );
}
