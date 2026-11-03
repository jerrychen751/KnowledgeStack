import { Location } from "@angular/common";
import { Injectable, inject, signal } from "@angular/core";

// The path the address bar shows, without the query or the hash. The ask page rewrites the address through
// Location instead of the router, so it can keep one component while the URL moves from / to /ask/<chatId>.
// Location reports those rewrites as well as router navigations and the back button, so this signal follows all
// three where the router's own state would miss the first.
@Injectable({ providedIn: "root" })
export class CurrentPath {
  private readonly location = inject(Location);
  readonly path = signal(normalizePath(this.location.path()));

  constructor() {
    this.location.onUrlChange((url) => this.path.set(normalizePath(url)));
  }
}

function normalizePath(url: string): string {
  const path = url.split(/[?#]/, 1)[0];
  return path === "" ? "/" : path;
}
