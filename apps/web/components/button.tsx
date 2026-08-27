import type { ComponentPropsWithoutRef, ReactNode } from "react";

import styles from "./ui.module.css";

/** Every button of the app. `variant` is `primary` for the one action a page leads with, and `default` for the rest. `type` is `button` unless the caller sets `submit`, because a bare `<button>` inside a form submits it. Pass a feature class through `className` to add spacing or a colour beside the shared rules. */
export function Button({
  variant = "default",
  className = "",
  type = "button",
  ...rest
}: ComponentPropsWithoutRef<"button"> & { variant?: "default" | "primary" }): ReactNode {
  return (
    <button
      type={type}
      className={`${styles.button} ${variant === "primary" ? styles.buttonPrimary : ""} ${className}`}
      {...rest}
    />
  );
}
