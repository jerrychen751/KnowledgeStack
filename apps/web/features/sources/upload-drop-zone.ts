import { Component, input, output, signal } from "@angular/core";

import { Button } from "@/components/button";

/** The target that reads uploaded files, by a drop or by the file picker. `fileExtensions` lists what an upload may carry, such as ".md", and is null until the connector status arrives. */
@Component({
  selector: "div[ksUploadDropZone]",
  host: {
    class: "sources-drop-zone",
    "[class.sources-drop-zone-over]": "isDragOver()",
    "(dragover)": "$event.preventDefault(); isDragOver.set(true)",
    "(dragleave)": "isDragOver.set(false)",
    "(drop)": "$event.preventDefault(); isDragOver.set(false); files.emit($event.dataTransfer?.files ?? null)",
  },
  imports: [Button],
  template: `
    <div class="sources-drop-copy">
      <p class="sources-drop-title">Drop files here.</p>
      <p class="sources-drop-note">{{
        fileExtensions() === null ? "Text documents only." : "Text documents only: " + fileExtensions()!.join(", ") + "."
      }}</p>
    </div>
    <button ksButton variant="primary" [disabled]="isBusy()" (click)="filePicker.click()">{{
      isBusy() ? busyMessage() : "Choose files"
    }}</button>
    <!-- Clearing the value lets the picker fire change again when the person picks the same file twice. -->
    <input
      #filePicker
      class="sources-hidden-input"
      type="file"
      multiple
      [attr.accept]="fileExtensions()?.join(',')"
      (change)="files.emit(filePicker.files); filePicker.value = ''"
    />
  `,
})
export class UploadDropZone {
  readonly fileExtensions = input.required<string[] | null>();
  readonly isBusy = input.required<boolean>();
  readonly busyMessage = input.required<string>();
  readonly files = output<FileList | null>();
  protected readonly isDragOver = signal(false);
}
