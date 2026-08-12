import assert from "node:assert/strict";
import test from "node:test";

import { NotionConnector } from "../../dist/connectors/notion.connector.js";

function createJsonResponse(body, init = {}) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json", ...init.headers },
    ...init,
  });
}

test("NotionConnector lists pages with an opaque cursor", async () => {
  const requests = [];
  const connector = new NotionConnector(
    { accessToken: "notion-token" },
    async (input, init) => {
      requests.push({ url: input.toString(), init });
      return createJsonResponse({
        results: [
          {
            object: "page",
            id: "page-1",
            url: "https://www.notion.so/page-1",
            last_edited_time: "2026-08-10T18:00:00.000Z",
            parent: { type: "page_id", page_id: "parent-page" },
            properties: {
              Name: {
                type: "title",
                title: [{ plain_text: "Architecture" }],
              },
            },
          },
        ],
        has_more: true,
        next_cursor: "next-page",
      });
    },
  );

  const page = await connector.listDocuments({
    cursor: "current-page",
    pageSize: 25,
  });

  assert.equal(page.documents.length, 1);
  assert.equal(page.documents[0].externalTitle, "Architecture");
  assert.equal(page.documents[0].externalParentId, "parent-page");
  assert.equal(page.documents[0].externalParentType, "page_id");
  assert.equal(page.documents[0].documentType, "page");
  assert.equal(page.isExhaustive, false);
  assert.equal(page.nextCursor, "next-page");
  assert.equal(requests.length, 1);
  assert.equal(requests[0].url, "https://api.notion.com/v1/search");
  assert.equal(requests[0].init.headers["Notion-Version"], "2026-03-11");
  assert.deepEqual(JSON.parse(requests[0].init.body), {
    filter: { property: "object", value: "page" },
    page_size: 25,
    sort: { direction: "descending", timestamp: "last_edited_time" },
    start_cursor: "current-page",
  });
});

test("NotionConnector fetches the complete nested block tree", async () => {
  const connector = new NotionConnector(
    { accessToken: "notion-token" },
    async (input) => {
      const url = new URL(input.toString());
      if (url.pathname === "/v1/pages/page-1") {
        return createJsonResponse({
          object: "page",
          id: "page-1",
          url: "https://www.notion.so/page-1",
          last_edited_time: "2026-08-10T19:00:00.000Z",
          properties: {},
        });
      }
      if (url.pathname === "/v1/blocks/page-1/children") {
        if (url.searchParams.get("start_cursor") === null) {
          return createJsonResponse({
            results: [
              {
                id: "heading-1",
                type: "heading_1",
                has_children: false,
                heading_1: { rich_text: [{ plain_text: "Design" }] },
              },
              {
                id: "toggle-1",
                type: "toggle",
                has_children: true,
                toggle: {
                  rich_text: [
                    {
                      plain_text: "Details",
                      href: "https://docs.example.com/details",
                    },
                  ],
                },
              },
            ],
            has_more: true,
            next_cursor: "blocks-2",
          });
        }

        assert.equal(url.searchParams.get("start_cursor"), "blocks-2");
        return createJsonResponse({
          results: [
            {
              id: "child-page-1",
              type: "child_page",
              has_children: true,
              child_page: { title: "Child page" },
            },
            {
              id: "table-1",
              type: "table",
              has_children: true,
              table: {
                table_width: 2,
                has_column_header: true,
                has_row_header: false,
              },
            },
          ],
          has_more: false,
          next_cursor: null,
        });
      }
      if (url.pathname === "/v1/blocks/toggle-1/children") {
        return createJsonResponse({
          results: [
            {
              id: "todo-1",
              type: "to_do",
              has_children: false,
              to_do: {
                checked: true,
                rich_text: [{ plain_text: "Write tests" }],
              },
            },
            {
              id: "image-1",
              type: "image",
              has_children: false,
              image: {
                caption: [{ plain_text: "Architecture diagram" }],
                file: { url: "https://temporary.example.com/image" },
              },
            },
            {
              id: "code-1",
              type: "code",
              has_children: false,
              code: {
                language: "text",
                rich_text: [{ plain_text: "before\n```\nafter" }],
              },
            },
            {
              id: "link-1",
              type: "link_to_page",
              has_children: false,
              link_to_page: { type: "page_id", page_id: "linked-page" },
            },
            {
              id: "toggle-2",
              type: "toggle",
              has_children: true,
              toggle: { rich_text: [{ plain_text: "Advanced" }] },
            },
          ],
          has_more: false,
          next_cursor: null,
        });
      }
      if (url.pathname === "/v1/blocks/toggle-2/children") {
        return createJsonResponse({
          results: [
            {
              id: "heading-2",
              type: "heading_2",
              has_children: false,
              heading_2: { rich_text: [{ plain_text: "Deep section" }] },
            },
          ],
          has_more: false,
          next_cursor: null,
        });
      }
      if (url.pathname === "/v1/blocks/table-1/children") {
        return createJsonResponse({
          results: [
            {
              id: "table-row-1",
              type: "table_row",
              has_children: false,
              table_row: {
                cells: [
                  [{ plain_text: "A | B" }],
                  [
                    {
                      plain_text: "[Docs]",
                      href: "https://docs.example.com/table",
                    },
                  ],
                ],
              },
            },
            {
              id: "table-row-2",
              type: "table_row",
              has_children: false,
              table_row: {
                cells: [[{ plain_text: "1" }], [{ plain_text: "2" }]],
              },
            },
          ],
          has_more: false,
          next_cursor: null,
        });
      }

      throw new Error(`Unexpected Notion request: ${url.toString()}`);
    },
  );

  const document = await connector.fetchDocumentById("page-1");

  assert.equal(document.externalId, "page-1");
  assert.equal(
    document.contents,
    [
      "# Design",
      "[Details](<https://docs.example.com/details>)",
      "> - [x] Write tests",
      "> Architecture diagram\n> [Notion image block: image-1]",
      "> ````text\n> before\n> ```\n> after\n> ````",
      "> [Notion page reference: linked-page]",
      "> Advanced",
      "> > ## Deep section",
      "# Child page",
      "| A \\| B | [\\[Docs\\]](<https://docs.example.com/table>) |\n| --- | --- |\n| 1 | 2 |",
    ].join("\n\n"),
  );
  assert.equal(
    document.externalUpdatedAt.toISOString(),
    "2026-08-10T19:00:00.000Z",
  );
});
