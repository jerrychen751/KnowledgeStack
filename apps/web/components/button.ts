import { Directive, input } from "@angular/core";

/** Every button of the app. `variant` is `primary` for the one action a page leads with, and `default` for the rest. `type` is `button` unless the caller sets `submit`, because a bare `<button>` inside a form submits it. Add a feature class beside `ksButton` to add spacing or a colour beside the shared rules. */
@Directive({
  selector: "button[ksButton]",
  host: {
    class: "ui-button",
    "[class.ui-button-primary]": "variant() === 'primary'",
    "[attr.type]": "type()",
  },
})
export class Button {
  readonly variant = input<"default" | "primary">("default");
  readonly type = input<"button" | "submit">("button");
}
