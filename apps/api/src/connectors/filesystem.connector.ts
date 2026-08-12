import { constants } from "node:fs";
import { lstat, open, readdir, realpath, stat } from "node:fs/promises";
import {
  basename,
  extname,
  isAbsolute,
  relative,
  resolve,
  sep,
} from "node:path";

import { DocumentType } from "../generated/prisma/enums.js";

import {
  type DocumentBody,
  type DocumentConnector,
  type DocumentPage,
  type DocumentRef,
  type ListDocumentsOptions,
} from "./connector.types.js";

export type FileSystemConnectorOptions = {
  // The owner of this directory must prevent untrusted directory-entry changes during a read.
  rootDirectory: string;
  ignoredDirectoryNames?: readonly string[];
  ignoredFileNames?: readonly string[];
  maxFileSizeBytes?: number;
  textExtensions?: readonly string[];
};

function isPathInsideRoot(rootDirectory: string, filePath: string): boolean {
  const relativePath = relative(rootDirectory, filePath);
  return (
    relativePath !== "" &&
    relativePath !== ".." &&
    !relativePath.startsWith(`..${sep}`) &&
    !isAbsolute(relativePath)
  );
}

function convertToExternalId(
  rootDirectory: string,
  filePath: string,
): string {
  return relative(rootDirectory, filePath).split(sep).join("/");
}

export class FileSystemConnector implements DocumentConnector {
  private readonly configuredRootDirectory: string;
  private readonly ignoredDirectoryNames: ReadonlySet<string>;
  private readonly ignoredFileNames: ReadonlySet<string>;
  private readonly maxFileSizeBytes: number;
  private readonly textExtensions: ReadonlySet<string>;

  constructor(options: FileSystemConnectorOptions) {
    if (options.rootDirectory.trim() === "") {
      throw new TypeError("The file system root directory cannot be empty.");
    }

    const maxFileSizeBytes = options.maxFileSizeBytes ?? 10 * 1024 * 1024;
    const textExtensions = options.textExtensions ?? [
      ".bash",
      ".c",
      ".cfg",
      ".conf",
      ".cpp",
      ".cs",
      ".csv",
      ".go",
      ".h",
      ".hpp",
      ".htm",
      ".html",
      ".ini",
      ".java",
      ".js",
      ".json",
      ".jsonl",
      ".jsx",
      ".md",
      ".mdx",
      ".php",
      ".py",
      ".rb",
      ".rs",
      ".rst",
      ".sh",
      ".sql",
      ".toml",
      ".ts",
      ".tsv",
      ".tsx",
      ".txt",
      ".xml",
      ".yaml",
      ".yml",
      ".zsh",
    ];

    this.configuredRootDirectory = resolve(options.rootDirectory);
    this.ignoredDirectoryNames = new Set(
      options.ignoredDirectoryNames ?? [".git", "node_modules"],
    );
    this.ignoredFileNames = new Set(
      options.ignoredFileNames ?? [".DS_Store", ".env", ".env.local"],
    );
    this.maxFileSizeBytes = maxFileSizeBytes;
    this.textExtensions = new Set(
      textExtensions.map((extension) => extension.toLowerCase()),
    );
  }

  private isIgnoredFile(fileName: string): boolean {
    return (
      this.ignoredFileNames.has(fileName) ||
      (fileName.startsWith(".env.") && fileName !== ".env.example")
    );
  }

  private isTextFile(filePath: string): boolean {
    const fileName = basename(filePath).toLowerCase();
    return (
      this.textExtensions.has(extname(fileName)) ||
      ["dockerfile", "license", "makefile", "readme"].includes(fileName)
    );
  }

  private async *iterateDocuments(
    rootDirectory: string,
    directory: string,
    cursor: string | undefined,
  ): AsyncGenerator<DocumentRef> {
    const entries = await readdir(directory, { withFileTypes: true });
    entries.sort((left, right) => {
      const leftKey = `${left.name}${left.isDirectory() ? "/" : ""}`;
      const rightKey = `${right.name}${right.isDirectory() ? "/" : ""}`;
      if (leftKey < rightKey) {
        return -1;
      }
      if (leftKey > rightKey) {
        return 1;
      }
      return 0;
    });

    for (const entry of entries) {
      const entryPath = resolve(directory, entry.name);
      const externalId = convertToExternalId(rootDirectory, entryPath);
      if (entry.isDirectory()) {
        const directoryPrefix = `${externalId}/`;
        if (
          !this.ignoredDirectoryNames.has(entry.name) &&
          !(
            cursor !== undefined &&
            directoryPrefix < cursor &&
            !cursor.startsWith(directoryPrefix)
          )
        ) {
          yield* this.iterateDocuments(rootDirectory, entryPath, cursor);
        }
        continue;
      }

      if (
        !entry.isFile() ||
        this.isIgnoredFile(entry.name) ||
        (cursor !== undefined && externalId <= cursor)
      ) {
        continue;
      }

      const fileStat = await stat(entryPath);
      const externalParentId = convertToExternalId(rootDirectory, directory);
      yield {
        externalId,
        externalTitle: entry.name,
        externalParentId: externalParentId === "" ? null : externalParentId,
        externalParentType: externalParentId === "" ? null : "directory",
        externalUrl: `filesystem:${externalId
          .split("/")
          .map(encodeURIComponent)
          .join("/")}`,
        documentType: this.isTextFile(entryPath)
          ? DocumentType.page
          : DocumentType.attachment,
        externalUpdatedAt: fileStat.mtime,
      };
    }
  }

  private async resolveFilePath(
    rootDirectory: string,
    externalId: string,
  ): Promise<string> {
    const pathParts = externalId.split("/");
    if (
      externalId === "" ||
      isAbsolute(externalId) ||
      pathParts.some((part) => part === "" || part === "." || part === "..")
    ) {
      throw new TypeError("The file id must be a relative normalized path.");
    }

    if (
      this.isIgnoredFile(pathParts.at(-1) as string) ||
      pathParts
        .slice(0, -1)
        .some((part) => this.ignoredDirectoryNames.has(part))
    ) {
      throw new TypeError("The file id identifies an ignored path.");
    }

    const filePath = resolve(rootDirectory, ...pathParts);
    if (!isPathInsideRoot(rootDirectory, filePath)) {
      throw new TypeError("The file id points outside the source root.");
    }

    let currentPath = rootDirectory;
    let fileStatus;
    for (const pathPart of pathParts) {
      currentPath = resolve(currentPath, pathPart);
      fileStatus = await lstat(currentPath);
      if (fileStatus.isSymbolicLink()) {
        throw new TypeError("The file id cannot include a symbolic link.");
      }
    }

    if (fileStatus === undefined || !fileStatus.isFile()) {
      throw new TypeError("The file id must identify a regular file.");
    }

    const canonicalFilePath = await realpath(filePath);
    if (!isPathInsideRoot(rootDirectory, canonicalFilePath)) {
      throw new TypeError("The file id points outside the source root.");
    }

    return canonicalFilePath;
  }

  async listDocuments(
    options: ListDocumentsOptions = {},
  ): Promise<DocumentPage> {
    const pageSize = options.pageSize ?? 100;
    const rootDirectory = await realpath(this.configuredRootDirectory);
    const rootStatus = await stat(rootDirectory);
    if (!rootStatus.isDirectory()) {
      throw new TypeError("The file system root must be a directory.");
    }

    const pageDocuments: DocumentRef[] = [];
    let hasMore = false;
    for await (const document of this.iterateDocuments(
      rootDirectory,
      rootDirectory,
      options.cursor,
    )) {
      if (pageDocuments.length === pageSize) {
        hasMore = true;
        break;
      }

      pageDocuments.push(document);
    }

    return {
      documents: pageDocuments,
      isExhaustive: true,
      nextCursor: hasMore
        ? (pageDocuments.at(-1)?.externalId ?? null)
        : null,
    };
  }

  async fetchDocumentById(externalId: string): Promise<DocumentBody> {
    const rootDirectory = await realpath(this.configuredRootDirectory);
    const filePath = await this.resolveFilePath(rootDirectory, externalId);
    if (!this.isTextFile(filePath)) {
      throw new TypeError("The file is an attachment and has no text body.");
    }

    const fileHandle = await open(
      filePath,
      constants.O_RDONLY | constants.O_NOFOLLOW,
    );
    try {
      const fileStatus = await fileHandle.stat();
      if (!fileStatus.isFile()) {
        throw new TypeError("The file id must identify a regular file.");
      }
      if (fileStatus.size > this.maxFileSizeBytes) {
        throw new RangeError(
          `The file exceeds the ${this.maxFileSizeBytes} byte limit.`,
        );
      }

      const contentChunks: Buffer[] = [];
      for await (const contentChunk of fileHandle.createReadStream({
        autoClose: false,
        end: this.maxFileSizeBytes,
        start: 0,
      })) {
        contentChunks.push(contentChunk);
      }
      const contentBuffer = Buffer.concat(contentChunks);
      if (contentBuffer.byteLength > this.maxFileSizeBytes) {
        throw new RangeError(
          `The file exceeds the ${this.maxFileSizeBytes} byte limit.`,
        );
      }

      const finalFileStatus = await fileHandle.stat();
      if (
        finalFileStatus.size !== fileStatus.size ||
        finalFileStatus.mtimeMs !== fileStatus.mtimeMs
      ) {
        throw new Error("The file changed during the read.");
      }

      return {
        externalId,
        contents: contentBuffer.toString("utf8"),
        externalUpdatedAt: finalFileStatus.mtime,
      };
    } finally {
      await fileHandle.close();
    }
  }
}
