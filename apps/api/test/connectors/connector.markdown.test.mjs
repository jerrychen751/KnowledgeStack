import assert from "node:assert/strict";
import test from "node:test";

import {
  formatMarkdownCodeBlock,
  formatMarkdownTableCell,
  formatSafeMarkdownLink,
} from "../../dist/connectors/connector.markdown.js";

test("Markdown helpers escape provider-controlled values", () => {
  assert.equal(
    formatSafeMarkdownLink("[Docs]", "javascript:alert(1)"),
    "\\[Docs\\]",
  );
  assert.equal(
    formatSafeMarkdownLink("Docs", "https://example.com/a b"),
    "[Docs](<https://example.com/a%20b>)",
  );
  assert.equal(
    formatMarkdownTableCell("A \\ B | C\nD"),
    "A \\ B \\| C D",
  );
  assert.equal(
    formatMarkdownTableCell(
      formatSafeMarkdownLink("[Docs]", "https://example.com/docs"),
    ),
    "[\\[Docs\\]](<https://example.com/docs>)",
  );
  assert.equal(
    formatMarkdownTableCell(String.raw`A \\| B`),
    String.raw`A \\\| B`,
  );
  assert.equal(
    formatMarkdownCodeBlock("before\n```\nafter", "text\n```"),
    "````text\nbefore\n```\nafter\n````",
  );
});
