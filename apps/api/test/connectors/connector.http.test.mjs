import assert from "node:assert/strict";
import test from "node:test";

import {
  ConnectorRequestError,
  fetchConnectorJson,
} from "../../dist/connectors/connector.http.js";

test("fetchConnectorJson returns structured provider errors", async () => {
  await assert.rejects(
    fetchConnectorJson(
      async () =>
        new Response("rate limit", {
          status: 429,
          statusText: "Too Many Requests",
          headers: { "Retry-After": "30" },
        }),
      "Notion",
      "list pages",
      "https://api.notion.com/v1/search",
    ),
    (error) => {
      assert.ok(error instanceof ConnectorRequestError);
      assert.equal(error.provider, "Notion");
      assert.equal(error.operation, "list pages");
      assert.equal(error.status, 429);
      assert.equal(error.retryAfter, "30");
      return true;
    },
  );
});
