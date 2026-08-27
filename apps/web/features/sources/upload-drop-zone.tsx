import { useRef, useState, type ReactNode } from "react";

import { Button } from "@/components/button";

import styles from "./sources.module.css";

/** The target that reads uploaded files, by a drop or by the file picker. `fileExtensions` lists what an upload may carry, such as ".md", and is null until the connector status arrives. */
export function UploadDropZone({
  fileExtensions,
  isBusy,
  busyMessage,
  onFiles,
}: {
  fileExtensions: string[] | null;
  isBusy: boolean;
  busyMessage: string;
  onFiles: (files: FileList | null) => void;
}): ReactNode {
  const [isDragOver, setIsDragOver] = useState(false);
  const filePickerRef = useRef<HTMLInputElement>(null);

  return (
    <div
      className={`${styles.dropZone} ${isDragOver ? styles.dropZoneOver : ""}`}
      onDragOver={(event) => {
        event.preventDefault();
        setIsDragOver(true);
      }}
      onDragLeave={() => setIsDragOver(false)}
      onDrop={(event) => {
        event.preventDefault();
        setIsDragOver(false);
        onFiles(event.dataTransfer.files);
      }}
    >
      <div className={styles.dropCopy}>
        <p className={styles.dropTitle}>Drop files here.</p>
        <p className={styles.dropNote}>
          {fileExtensions === null
            ? "Text documents only."
            : `Text documents only: ${fileExtensions.join(", ")}.`}
        </p>
      </div>
      <Button
        variant="primary"
        disabled={isBusy}
        onClick={() => filePickerRef.current?.click()}
      >
        {isBusy ? busyMessage : "Choose files"}
      </Button>
      <input
        ref={filePickerRef}
        className={styles.hiddenInput}
        type="file"
        multiple
        accept={fileExtensions?.join(",")}
        onChange={(event) => {
          onFiles(event.target.files);
          event.target.value = "";
        }}
      />
    </div>
  );
}
