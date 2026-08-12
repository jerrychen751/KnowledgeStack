import assert from "node:assert/strict";
import test from "node:test";

import { ConfluenceConnector } from "../../dist/connectors/confluence.connector.js";

function createJsonResponse(body, init = {}) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json", ...init.headers },
    ...init,
  });
}

test("ConfluenceConnector lists current pages from the configured spaces", async () => {
  const requests = [];
  const connector = new ConfluenceConnector(
    {
      accessToken: "confluence-token",
      cloudId: "cloud-1",
      siteUrl: "https://example.atlassian.net",
      spaceIds: ["101", "202"],
    },
    async (input, init) => {
      requests.push({ url: input.toString(), init });
      return createJsonResponse({
        results: [
          {
            id: "42",
            parentId: "21",
            parentType: "page",
            title: "Runbook",
            version: { createdAt: "2026-08-09T15:00:00.000Z" },
            _links: { webui: "/wiki/spaces/ENG/pages/42" },
          },
        ],
        _links: {
          next: "/wiki/api/v2/pages?cursor=next%2Fpage",
        },
      });
    },
  );

  const page = await connector.listDocuments({ cursor: "page-1", pageSize: 20 });

  assert.equal(page.documents.length, 1);
  assert.equal(page.documents[0].externalTitle, "Runbook");
  assert.equal(page.documents[0].externalParentId, "21");
  assert.equal(page.documents[0].externalParentType, "page");
  assert.equal(
    page.documents[0].externalUrl,
    "https://example.atlassian.net/wiki/spaces/ENG/pages/42",
  );
  assert.equal(page.isExhaustive, true);
  assert.equal(page.nextCursor, "next/page");
  const requestUrl = new URL(requests[0].url);
  assert.equal(requestUrl.pathname, "/ex/confluence/cloud-1/wiki/api/v2/pages");
  assert.equal(requestUrl.searchParams.get("limit"), "20");
  assert.equal(requestUrl.searchParams.get("status"), "current");
  assert.equal(requestUrl.searchParams.get("cursor"), "page-1");
  assert.deepEqual(requestUrl.searchParams.getAll("space-id"), ["101", "202"]);
  assert.equal(requests[0].init.headers.Authorization, "Bearer confluence-token");
});

test("ConfluenceConnector reads a cursor from the Link header", async () => {
  const connector = new ConfluenceConnector(
    {
      accessToken: "confluence-token",
      cloudId: "cloud-1",
      siteUrl: "https://example.atlassian.net",
      spaceIds: ["101"],
    },
    async () =>
      createJsonResponse(
        { results: [] },
        {
          headers: {
            Link: '</wiki/api/v2/pages?cursor=header%2Fpage>; rel="next"',
          },
        },
      ),
  );

  const page = await connector.listDocuments();

  assert.equal(page.nextCursor, "header/page");
});

test("ConfluenceConnector converts Atlas Document Format into text", async () => {
  const connector = new ConfluenceConnector(
    {
      accessToken: "confluence-token",
      cloudId: "cloud-1",
      siteUrl: "https://example.atlassian.net",
      spaceIds: ["101"],
    },
    async (input) => {
      const url = new URL(input.toString());
      assert.equal(url.searchParams.get("body-format"), "atlas_doc_format");
      return createJsonResponse({
        id: "42",
        title: "Runbook",
        version: { createdAt: "2026-08-09T16:00:00.000Z" },
        body: {
          atlas_doc_format: {
            value: JSON.stringify({
              type: "doc",
              content: [
                {
                  type: "heading",
                  attrs: { level: 1 },
                  content: [{ type: "text", text: "Runbook" }],
                },
                {
                  type: "paragraph",
                  content: [
                    { type: "text", text: "Open " },
                    {
                      type: "text",
                      text: "provider docs",
                      marks: [
                        {
                          type: "link",
                          attrs: { href: "https://docs.example.com/provider" },
                        },
                      ],
                    },
                  ],
                },
                {
                  type: "bulletList",
                  content: [
                    {
                      type: "listItem",
                      content: [
                        {
                          type: "paragraph",
                          content: [{ type: "text", text: "Check logs" }],
                        },
                      ],
                    },
                  ],
                },
                {
                  type: "codeBlock",
                  attrs: { language: "text" },
                  content: [{ type: "text", text: "before\n```\nafter" }],
                },
                {
                  type: "paragraph",
                  content: [
                    {
                      type: "date",
                      attrs: {
                        timestamp: String(Date.UTC(2026, 7, 9) / 1000),
                      },
                    },
                  ],
                },
                {
                  type: "paragraph",
                  content: [{ type: "mention", attrs: { id: "user-1" } }],
                },
                {
                  type: "mediaSingle",
                  content: [
                    { type: "media", attrs: { id: "media-1" } },
                  ],
                },
                {
                  type: "table",
                  content: [
                    {
                      type: "tableRow",
                      content: [
                        {
                          type: "tableHeader",
                          content: [
                            {
                              type: "paragraph",
                              content: [{ type: "text", text: "A | B" }],
                            },
                          ],
                        },
                        {
                          type: "tableHeader",
                          content: [
                            {
                              type: "paragraph",
                              content: [{ type: "text", text: "C" }],
                            },
                          ],
                        },
                      ],
                    },
                    {
                      type: "tableRow",
                      content: [
                        {
                          type: "tableCell",
                          content: [
                            {
                              type: "paragraph",
                              content: [{ type: "text", text: "1" }],
                            },
                          ],
                        },
                        {
                          type: "tableCell",
                          content: [
                            {
                              type: "paragraph",
                              content: [{ type: "text", text: "2" }],
                            },
                          ],
                        },
                      ],
                    },
                  ],
                },
              ],
            }),
          },
        },
        _links: { webui: "/wiki/spaces/ENG/pages/42" },
      });
    },
  );

  const document = await connector.fetchDocumentById("42");

  assert.equal(
    document.contents,
    [
      "# Runbook",
      "Open [provider docs](<https://docs.example.com/provider>)",
      "- Check logs",
      "````text\nbefore\n```\nafter\n````",
      "2026-08-09",
      "[Confluence mention: user-1]",
      "[Confluence media: media-1]",
      "| A \\| B | C |\n| --- | --- |\n| 1 | 2 |",
    ].join("\n\n"),
  );
  assert.equal(
    document.externalUpdatedAt.toISOString(),
    "2026-08-09T16:00:00.000Z",
  );
});
