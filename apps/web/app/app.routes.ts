import type { Routes } from "@angular/router";

export const routes: Routes = [
  {
    // A new chat. The page opens the chat row on the first question and replaces the URL with /ask/<chatId>.
    path: "",
    pathMatch: "full",
    data: { chatId: null },
    loadComponent: () => import("@/features/ask/ask-page").then((m) => m.AskPage),
  },
  {
    // One stored chat. `/` opens an empty one, and the page replaces the URL with this route after the first question.
    path: "ask/:chatId",
    loadComponent: () => import("@/features/ask/ask-page").then((m) => m.AskPage),
  },
  { path: "sources", loadComponent: () => import("@/features/sources/sources-page").then((m) => m.SourcesPage) },
  { path: "databases", loadComponent: () => import("@/features/databases/databases-page").then((m) => m.DatabasesPage) },
  { path: "workspaces", loadComponent: () => import("@/features/workspaces/workspaces-page").then((m) => m.WorkspacesPage) },
  { path: "signin", loadComponent: () => import("@/features/signin/signin-page").then((m) => m.SignInPage) },
  {
    path: "settings",
    loadComponent: () => import("@/features/settings/settings-layout").then((m) => m.SettingsLayout),
    children: [
      // Settings holds one page today, so /settings opens it instead of listing one link.
      { path: "", pathMatch: "full", redirectTo: "mcp-tokens" },
      { path: "mcp-tokens", loadComponent: () => import("@/features/mcp-tokens/mcp-tokens-page").then((m) => m.McpTokensPage) },
    ],
  },
  { path: "**", loadComponent: () => import("./not-found").then((m) => m.NotFoundPage) },
];
