"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

import { Label } from "@/components/label";

import styles from "./settings.module.css";

/** The left column of every settings page: one heading for each group, and the pages of that group under it. */
export function SettingsNav(): ReactNode {
  const pathname = usePathname();
  const groups = [
    {
      label: "Developer",
      pages: [{ href: "/settings/mcp-tokens", label: "MCP Tokens" }],
    },
  ];

  return (
    <nav className={styles.nav}>
      <h2 className={styles.navTitle}>Settings</h2>
      {groups.map((group) => (
        <div key={group.label} className={styles.group}>
          <Label as="p">{group.label}</Label>
          <ul className={styles.groupPages}>
            {group.pages.map((page) => {
              const isActive = pathname === page.href;

              return (
                <li key={page.href}>
                  <Link
                    href={page.href}
                    className={`${styles.navLink} ${isActive ? styles.navLinkActive : ""}`}
                    aria-current={isActive ? "page" : undefined}
                  >
                    {page.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}
