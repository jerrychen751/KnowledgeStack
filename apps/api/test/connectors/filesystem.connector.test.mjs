import assert from "node:assert/strict";
import { mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { FileSystemConnector } from "../../dist/connectors/filesystem.connector.js";

const fixtureDirectory = fileURLToPath(
  new URL("../fixtures/filesystem", import.meta.url),
);

test("FileSystemConnector lists regular files with a path cursor", async () => {
  const connector = new FileSystemConnector({
    rootDirectory: fixtureDirectory,
    ignoredFileNames: ["secret.txt"],
  });

  const firstPage = await connector.listDocuments({ pageSize: 2 });
  assert.deepEqual(
    firstPage.documents.map((document) => ({
      id: document.externalId,
      type: document.documentType,
    })),
    [
      { id: "attachment.pdf", type: "attachment" },
      { id: "nested/notes.txt", type: "page" },
    ],
  );
  assert.equal(firstPage.nextCursor, "nested/notes.txt");
  assert.equal(
    firstPage.documents[1].externalUrl,
    "filesystem:nested/notes.txt",
  );
  assert.equal(firstPage.documents[1].externalParentId, "nested");
  assert.equal(firstPage.documents[1].externalParentType, "directory");
  assert.equal(firstPage.isExhaustive, true);

  const secondPage = await connector.listDocuments({
    cursor: firstPage.nextCursor,
    pageSize: 2,
  });
  assert.deepEqual(
    secondPage.documents.map((document) => document.externalId),
    ["root.md"],
  );
  assert.equal(secondPage.documents[0].externalParentId, null);
  assert.equal(secondPage.documents[0].externalParentType, null);
  assert.equal(secondPage.nextCursor, null);
});

test("FileSystemConnector reads text and rejects unsafe or binary paths", async () => {
  const connector = new FileSystemConnector({
    rootDirectory: fixtureDirectory,
    ignoredFileNames: ["secret.txt"],
  });

  const document = await connector.fetchDocumentById("nested/notes.txt");
  assert.equal(document.contents, "Nested notes.\n");
  await assert.rejects(
    connector.fetchDocumentById("../outside.txt"),
    /relative normalized path/,
  );
  await assert.rejects(
    connector.fetchDocumentById("secret.txt"),
    /ignored path/,
  );
  await assert.rejects(
    connector.fetchDocumentById("attachment.pdf"),
    /attachment/,
  );
});

test("FileSystemConnector bounds file reads and rejects symbolic links", async (testContext) => {
  const rootDirectory = await mkdtemp(
    join(tmpdir(), "knowledgestack-filesystem-connector-"),
  );
  testContext.after(() => rm(rootDirectory, { force: true, recursive: true }));
  await writeFile(join(rootDirectory, "large.txt"), "12345");
  await symlink("large.txt", join(rootDirectory, "link.txt"));
  const connector = new FileSystemConnector({
    maxFileSizeBytes: 4,
    rootDirectory,
  });

  await assert.rejects(connector.fetchDocumentById("large.txt"), /4 byte limit/);
  await assert.rejects(connector.fetchDocumentById("link.txt"), /symbolic link/);
});
