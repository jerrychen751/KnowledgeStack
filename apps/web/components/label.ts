import { Directive } from "@angular/core";

/** The small uppercase heading that names a section, a card field, or a rail. Put it on a `span` to sit beside its siblings, or on a `p` to start its own line. */
@Directive({ selector: "p[ksLabel], span[ksLabel]", host: { class: "ui-label" } })
export class Label {}
