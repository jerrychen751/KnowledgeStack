import { Component } from "@angular/core";
import { RouterOutlet } from "@angular/router";

import { SettingsNav } from "./settings-nav";

@Component({
  selector: "ks-settings-layout",
  host: { style: "display: contents" },
  imports: [RouterOutlet, SettingsNav],
  template: `
    <div class="settings-layout">
      <nav ksSettingsNav></nav>
      <div><router-outlet /></div>
    </div>
  `,
})
export class SettingsLayout {}
