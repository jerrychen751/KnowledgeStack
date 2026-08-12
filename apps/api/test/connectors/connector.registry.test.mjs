import assert from "node:assert/strict";
import test from "node:test";

import { ConfluenceConnector } from "../../dist/connectors/confluence.connector.js";
import { ConnectorRegistry } from "../../dist/connectors/connector.registry.js";
import { FileSystemConnector } from "../../dist/connectors/filesystem.connector.js";
import { NotionConnector } from "../../dist/connectors/notion.connector.js";

test("ConnectorRegistry creates the connector for each provider", () => {
  const registry = new ConnectorRegistry();

  assert.ok(
    registry.createConnector({
      provider: "notion",
      accessToken: "notion-token",
    }) instanceof NotionConnector,
  );
  assert.ok(
    registry.createConnector({
      provider: "confluence",
      accessToken: "confluence-token",
      cloudId: "cloud-1",
      siteUrl: "https://example.atlassian.net",
      spaceIds: ["101"],
    }) instanceof ConfluenceConnector,
  );
  assert.ok(
    registry.createConnector({
      provider: "filesystem",
      rootDirectory: "/tmp",
    }) instanceof FileSystemConnector,
  );
});
