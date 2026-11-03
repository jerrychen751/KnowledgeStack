import { mergeApplicationConfig, type ApplicationConfig } from "@angular/core";
import { provideServerRendering, RenderMode, withRoutes, type ServerRoute } from "@angular/ssr";

import { appConfig } from "./app.config";

export const serverConfig: ApplicationConfig = mergeApplicationConfig(appConfig, {
  providers: [
    // Every page reads the API from the browser after it loads, so a server render would only draw empty frames.
    // The server answers each page with the app shell and the browser renders it.
    provideServerRendering(
      withRoutes([
        ...["", "ask/:chatId", "sources", "databases", "workspaces", "signin", "settings/mcp-tokens"].map((path): ServerRoute => ({
          path,
          renderMode: RenderMode.Client,
        })),
        // /settings redirects to its one page, with the status Next.js used for the same redirect.
        { path: "settings", renderMode: RenderMode.Client, status: 307 },
        // Any other path draws the not-found page, and the status tells crawlers and scripts the same.
        { path: "**", renderMode: RenderMode.Client, status: 404 },
      ]),
    ),
  ],
});
