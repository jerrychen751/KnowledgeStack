import { Component } from "@angular/core";

/** The tick a Copy button shows for two seconds after it writes a value to the clipboard. The stroke takes the colour of the label beside it. */
@Component({
  selector: "svg[ksCheckMark]",
  host: { class: "ui-check-mark", viewBox: "0 0 16 16", "aria-hidden": "true" },
  template: `
    <svg:path
      d="M3.25 8.5 6.4 11.65 12.75 5"
      fill="none"
      stroke="currentColor"
      stroke-width="1.75"
      stroke-linecap="round"
      stroke-linejoin="round"
    />
  `,
})
export class CheckMark {}
