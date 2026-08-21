import { DocumentType } from "../generated/prisma/enums.js";

import { ConnectorRequestError, fetchConnectorJson } from "./connector.http.js";
import {
  formatMarkdownCodeBlock,
  formatMarkdownTableCell,
  formatSafeMarkdownLink,
} from "./connector.markdown.js";
import {
  type DocumentBody,
  type DocumentConnector,
  type DocumentPage,
  type DocumentRef,
  type ListDocumentsOptions,
} from "./connector.types.js";

export type NotionConnectorOptions = {
  accessToken: string;
  notionVersion?: string;
};

type NotionParent =
  | { type: "agent_id"; agent_id: string }
  | { type: "block_id"; block_id: string }
  | { type: "database_id"; database_id: string }
  | {
      type: "data_source_id";
      data_source_id: string;
      database_id: string;
    }
  | { type: "page_id"; page_id: string }
  | { type: "workspace"; workspace: true };

type NotionPage = {
  id: string;
  url: string;
  last_edited_time: string;
  in_trash: boolean;
  parent: NotionParent;
  properties: Record<string, unknown>;
};

type NotionSearchResponse = {
  results: NotionPage[];
  has_more: boolean;
  next_cursor: string | null;
};

type NotionBlock = {
  id: string;
  type: string;
  has_children: boolean;
  [key: string]: unknown;
};

type NotionBlockResponse = {
  results: NotionBlock[];
  has_more: boolean;
  next_cursor: string | null;
};

function readNotionPlainText(value: unknown): string {
  if (!Array.isArray(value)) {
    return "";
  }

  return value
    .map((item) => {
      if (typeof item !== "object" || item === null) {
        return "";
      }

      const plainText = (item as Record<string, unknown>).plain_text;
      return typeof plainText === "string" ? plainText : "";
    })
    .join("");
}

function renderNotionRichText(value: unknown): string {
  if (!Array.isArray(value)) {
    return "";
  }

  return value
    .map((item) => {
      if (typeof item !== "object" || item === null) {
        return "";
      }

      const richText = item as Record<string, unknown>;
      const plainText =
        typeof richText.plain_text === "string" ? richText.plain_text : "";
      return formatSafeMarkdownLink(plainText, richText.href);
    })
    .join("");
}

function readNotionPageTitle(properties: Record<string, unknown>): string {
  for (const property of Object.values(properties)) {
    if (typeof property !== "object" || property === null) {
      continue;
    }

    const propertyValue = property as Record<string, unknown>;
    if (propertyValue.type === "title") {
      return readNotionPlainText(propertyValue.title) || "Untitled";
    }
  }

  return "Untitled";
}

function mapNotionPage(page: NotionPage): DocumentRef {
  return {
    externalId: page.id,
    externalTitle: readNotionPageTitle(page.properties),
    externalParentId: readNotionParentId(page.parent),
    externalParentType: page.parent.type,
    externalUrl: page.url,
    documentType: DocumentType.page,
    externalUpdatedAt: new Date(page.last_edited_time),
  };
}

function readNotionParentId(parent: NotionParent): string | null {
  switch (parent.type) {
    case "agent_id":
      return parent.agent_id;
    case "block_id":
      return parent.block_id;
    case "database_id":
      return parent.database_id;
    case "data_source_id":
      return parent.data_source_id;
    case "page_id":
      return parent.page_id;
    case "workspace":
      return null;
  }
}

function readNotionBlockValue(block: NotionBlock): Record<string, unknown> {
  const value = block[block.type];
  if (typeof value !== "object" || value === null) {
    return {};
  }

  return value as Record<string, unknown>;
}

function formatNotionBlockContents(
  block: NotionBlock,
  isTableHeaderRow: boolean,
): string {
  const value = readNotionBlockValue(block);
  const text = renderNotionRichText(value.rich_text);

  switch (block.type) {
    case "heading_1":
      return `# ${text}`;
    case "heading_2":
      return `## ${text}`;
    case "heading_3":
      return `### ${text}`;
    case "heading_4":
      return `#### ${text}`;
    case "bulleted_list_item":
      return `- ${text}`;
    case "numbered_list_item":
      return `1. ${text}`;
    case "to_do":
      return `- [${value.checked === true ? "x" : " "}] ${text}`;
    case "quote":
      return `> ${text}`;
    case "code": {
      const language = typeof value.language === "string" ? value.language : "";
      return formatMarkdownCodeBlock(
        readNotionPlainText(value.rich_text),
        language,
      );
    }
    case "divider":
      return "---";
    case "child_page":
    case "child_database":
      return typeof value.title === "string" ? `# ${value.title}` : "";
    case "equation":
      return typeof value.expression === "string" ? value.expression : "";
    case "link_to_page": {
      const targetId =
        value.page_id ?? value.database_id ?? value.comment_id ?? block.id;
      return `[Notion page reference: ${String(targetId)}]`;
    }
    case "bookmark":
    case "embed":
    case "link_preview":
      return typeof value.url === "string"
        ? formatSafeMarkdownLink(value.url, value.url)
        : "";
    case "audio":
    case "file":
    case "image":
    case "pdf":
    case "video": {
      const caption = renderNotionRichText(value.caption);
      const blockReference = `[Notion ${block.type} block: ${block.id}]`;
      return caption === "" ? blockReference : `${caption}\n${blockReference}`;
    }
    case "table_row": {
      if (!Array.isArray(value.cells)) {
        return "";
      }

      const cells = value.cells
        .map(renderNotionRichText)
        .map(formatMarkdownTableCell);
      const row = `| ${cells.join(" | ")} |`;
      return isTableHeaderRow
        ? `${row}\n| ${cells.map(() => "---").join(" | ")} |`
        : row;
    }
    default:
      return text;
  }
}

function formatNotionBlock(
  block: NotionBlock,
  listDepth: number,
  quoteDepth: number,
  isTableHeaderRow: boolean,
): string {
  const contents = formatNotionBlockContents(block, isTableHeaderRow);
  if (contents === "" || (listDepth === 0 && quoteDepth === 0)) {
    return contents;
  }

  const quotePrefix = "> ".repeat(quoteDepth);
  const linePrefix = `${quotePrefix}${"  ".repeat(listDepth)}`;
  return contents
    .split("\n")
    .map((line) =>
      line === "" && quoteDepth > 0
        ? quotePrefix.trimEnd()
        : `${linePrefix}${line}`,
    )
    .join("\n");
}

async function fetchNotionBlockContents(
  accessToken: string,
  notionVersion: string,
  blockId: string,
  listDepth = 0,
  quoteDepth = 0,
  hasColumnHeader = false,
): Promise<string[]> {
  const lines: string[] = [];
  let cursor: string | null = null;
  let tableRowIndex = 0;

  do {
    const url = new URL(
      `/v1/blocks/${encodeURIComponent(blockId)}/children`,
      "https://api.notion.com",
    );
    url.searchParams.set("page_size", "100");
    if (cursor !== null) {
      url.searchParams.set("start_cursor", cursor);
    }

    const { body } = await fetchConnectorJson<NotionBlockResponse>(
      "Notion",
      "list block children",
      url,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Notion-Version": notionVersion,
        },
      },
    );

    for (const block of body.results) {
      const isTableHeaderRow =
        hasColumnHeader && block.type === "table_row" && tableRowIndex === 0;
      const line = formatNotionBlock(
        block,
        listDepth,
        quoteDepth,
        isTableHeaderRow,
      );
      if (line !== "") {
        lines.push(line);
      }
      if (block.type === "table_row") {
        tableRowIndex += 1;
      }

      if (
        block.has_children &&
        !["child_page", "child_database"].includes(block.type)
      ) {
        const childListDepth = [
          "bulleted_list_item",
          "numbered_list_item",
          "to_do",
        ].includes(block.type)
          ? listDepth + 1
          : listDepth;
        const childQuoteDepth = ["callout", "quote", "toggle"].includes(
          block.type,
        )
          ? quoteDepth + 1
          : quoteDepth;
        const childHasColumnHeader =
          block.type === "table" &&
          readNotionBlockValue(block).has_column_header === true;
        const childLines = await fetchNotionBlockContents(
          accessToken,
          notionVersion,
          block.id,
          childListDepth,
          childQuoteDepth,
          childHasColumnHeader,
        );
        if (block.type === "table") {
          lines.push(childLines.join("\n"));
        } else {
          lines.push(...childLines);
        }
      }
    }

    cursor = body.has_more ? body.next_cursor : null;
  } while (cursor !== null);

  return lines;
}

export class NotionConnector implements DocumentConnector {
  private readonly accessToken: string;
  private readonly notionVersion: string;

  constructor(options: NotionConnectorOptions) {
    this.accessToken = options.accessToken;
    this.notionVersion = options.notionVersion ?? "2026-03-11";
  }

  async listDocuments(
    options: ListDocumentsOptions = {},
  ): Promise<DocumentPage> {
    const requestBody: Record<string, unknown> = {
      filter: {
        property: "object",
        value: "page",
      },
      page_size: options.pageSize ?? 100,
      // Ascending order stops a concurrent edit from hiding a page: the new last_edited_time moves the
      // page after the cursor, so this walk lists it a second time and the upsert absorbs the repeat.
      // Descending order moves it to position 0, before the cursor, and the deletion sweep removes it.
      sort: {
        direction: "ascending",
        timestamp: "last_edited_time",
      },
    };
    if (options.cursor !== undefined) {
      requestBody.start_cursor = options.cursor;
    }

    const { body } = await fetchConnectorJson<NotionSearchResponse>(
      "Notion",
      "list pages",
      "https://api.notion.com/v1/search",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
          "Content-Type": "application/json",
          "Notion-Version": this.notionVersion,
        },
        body: JSON.stringify(requestBody),
      },
    );

    // Notion search can still omit an accessible page while its index lags. The deletion sweep in
    // sync/sync.service.ts reads that absence as a deletion, and the next pass re-embeds the page.
    return {
      documents: body.results.map(mapNotionPage),
      nextCursor: body.has_more ? body.next_cursor : null,
    };
  }

  async fetchDocumentById(externalId: string): Promise<DocumentBody> {
    const { body: page } = await fetchConnectorJson<NotionPage>(
      "Notion",
      "fetch a page",
      `https://api.notion.com/v1/pages/${encodeURIComponent(externalId)}`,
      {
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
          "Notion-Version": this.notionVersion,
        },
      },
    );
    const contents = await fetchNotionBlockContents(
      this.accessToken,
      this.notionVersion,
      externalId,
    );

    return {
      textFormat: "markdown",
      externalId: page.id,
      text: contents.join("\n\n"),
      externalUpdatedAt: new Date(page.last_edited_time),
    };
  }

  async checkDocumentExists(externalId: string): Promise<boolean> {
    try {
      const { body: page } = await fetchConnectorJson<NotionPage>(
        "Notion",
        "check a page",
        `https://api.notion.com/v1/pages/${encodeURIComponent(externalId)}`,
        {
          headers: {
            Authorization: `Bearer ${this.accessToken}`,
            "Notion-Version": this.notionVersion,
          },
        },
      );

      // A trashed page answers 200 for the 30 days before Notion purges it, so the flag decides.
      return !page.in_trash;
    } catch (error) {
      // 404 covers a purged page and a page this integration lost access to. Neither one can be
      // fetched or cited again, so both count as gone. Every other status throws and stops the sweep.
      if (error instanceof ConnectorRequestError && error.status === 404) {
        return false;
      }

      throw error;
    }
  }
}
