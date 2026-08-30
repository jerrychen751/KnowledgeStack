import type { Metadata } from "next";
import { IBM_Plex_Mono, IBM_Plex_Sans } from "next/font/google";
import Link from "next/link";
import type { ReactNode } from "react";

import { AccountMenu } from "@/features/shell/account-menu";
import { NavLinks } from "@/features/shell/nav-links";
import styles from "@/features/shell/shell.module.css";
import "@/styles/globals.css";

const sans = IBM_Plex_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-sans",
});

const mono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-mono",
});

export const metadata: Metadata = {
  title: "KnowledgeStack",
  description: "Ask a question about your documents and read the chunk the answer came from.",
};

export default function RootLayout({ children }: { children: ReactNode }): ReactNode {
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable}`}>
      <body>
        <div className={styles.shell}>
          <header className={styles.header}>
            <Link href="/" className={styles.wordmark}>
              <svg
                className={styles.mark}
                width="14"
                height="12"
                viewBox="0 0 14 12"
                aria-hidden="true"
                fill="none"
              >
                <rect y="0" width="14" height="2" fill="currentColor" />
                <rect y="5" width="10" height="2" fill="currentColor" />
                <rect y="10" width="6" height="2" fill="var(--signal)" />
              </svg>
              <span className={styles.wordmarkText}>KnowledgeStack</span>
            </Link>
            <NavLinks
              pages={[
                { href: "/", label: "Ask" },
                { href: "/sources", label: "Sources" },
                { href: "/databases", label: "Databases" },
              ]}
            />
            <AccountMenu />
          </header>
          <main className={styles.main}>{children}</main>
        </div>
      </body>
    </html>
  );
}
