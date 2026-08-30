import { redirect } from "next/navigation";

/** Settings holds one page today, so /settings opens it instead of listing one link. */
export default function SettingsPage(): never {
  redirect("/settings/mcp-tokens");
}
