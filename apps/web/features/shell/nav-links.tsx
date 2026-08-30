"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

import styles from "./shell.module.css";

export function NavLinks({ pages }: { pages: { href: string; label: string }[] }): ReactNode {
  const pathname = usePathname();
  // Every page behind these links needs a session, so the sign-in page shows none of them.
  if (pathname === "/signin") {
    return null;
  }

  return (
    <nav className={styles.nav}>
      {pages.map((page) => {
        // Settings holds nested pages, so a link stays current while the browser reads any page under it.
        const isActive =
          page.href === "/"
            ? pathname === "/" || pathname.startsWith("/ask/")
            : pathname === page.href || pathname.startsWith(`${page.href}/`);

        return (
          <Link
            key={page.href}
            href={page.href}
            className={`${styles.navLink} ${isActive ? styles.navLinkActive : ""}`}
            aria-current={isActive ? "page" : undefined}
          >
            {page.label}
          </Link>
        );
      })}
    </nav>
  );
}
