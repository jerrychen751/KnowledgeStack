import { Component } from "@angular/core";

// Next.js drew this page for any unknown path, so the port keeps its type and layout. Next.js also turned the
// page background white and sized the block to the whole window, which made the page scroll; this fills the
// space under the header and keeps the app's own background.
@Component({
  selector: "ks-not-found-page",
  host: { style: "display: contents" },
  template: `
    <div
      style="font-family: system-ui, &quot;Segoe UI&quot;, Roboto, Helvetica, Arial, sans-serif, &quot;Apple Color Emoji&quot;, &quot;Segoe UI Emoji&quot;; min-height: calc(100dvh - 3.25rem); text-align: center; display: flex; flex-direction: column; align-items: center; justify-content: center"
    >
      <div>
        <h1
          style="display: inline-block; margin: 0 20px 0 0; padding: 0 23px 0 0; border-right: 1px solid rgba(0, 0, 0, 0.3); font-size: 24px; font-weight: 500; vertical-align: top; line-height: 49px"
        >404</h1><div style="display: inline-block"><h2 style="font-size: 14px; font-weight: 400; line-height: 49px; margin: 0">This page could not be found.</h2></div>
      </div>
    </div>
  `,
})
export class NotFoundPage {}
