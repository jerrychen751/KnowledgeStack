import { Directive } from "@angular/core";

/** The dashed placeholder a section shows in place of a list that holds nothing. */
@Directive({ selector: "p[ksEmptyState]", host: { class: "ui-empty" } })
export class EmptyState {}
