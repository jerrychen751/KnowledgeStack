import { DocumentType } from "../generated/prisma/enums.js";

import { fetchConnectorJson } from "./connector.http.js";
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

export type ConfluenceConnectorOptions = {
  accessToken: string;
  cloudId: string;
  siteUrl: string;
  spaceIds: readonly [string, ...string[]];
};

type ConfluencePage = {
  id: string;
  parentId: string;
  parentType: string;
  title: string;
  version: {
    createdAt: string;
  };
  _links: {
    webui: string;
  };
};

type ConfluencePageWithBody = ConfluencePage & {
  body: {
    atlas_doc_format: {
      value: string;
    };
  };
};

type ConfluencePageResponse = {
  results: ConfluencePage[];
  _links?: {
    next?: string;
  };
};

type AtlassianDocumentNode = {
  type?: string;
  text?: string;
  attrs?: Record<string, unknown>;
  content?: AtlassianDocumentNode[];
  marks?: Array<{
    type?: string;
    attrs?: Record<string, unknown>;
  }>;
};

function mapConfluencePage(
  page: ConfluencePage,
  siteUrl: URL,
): DocumentRef {
  return {
    externalId: page.id,
    externalTitle: page.title,
    externalParentId: page.parentId,
    externalParentType: page.parentType,
    externalUrl: new URL(page._links.webui, siteUrl).toString(),
    documentType: DocumentType.page,
    externalUpdatedAt: new Date(page.version.createdAt),
  };
}

function findConfluenceNextUrl(
  responseBody: ConfluencePageResponse,
  response: Response,
): string | null {
  if (responseBody._links?.next !== undefined) {
    return responseBody._links.next;
  }

  const linkHeader = response.headers.get("link");
  if (linkHeader === null) {
    return null;
  }

  for (const entry of linkHeader.split(",")) {
    const match = entry.match(/<([^>]+)>;[^,]*rel="next"/);
    if (match?.[1] !== undefined) {
      return match[1];
    }
  }

  return null;
}

function findConfluenceNextCursor(
  responseBody: ConfluencePageResponse,
  response: Response,
): string | null {
  const nextUrl = findConfluenceNextUrl(responseBody, response);
  if (nextUrl === null) {
    return null;
  }

  const cursor = new URL(nextUrl, "https://api.atlassian.com").searchParams.get(
    "cursor",
  );
  return cursor;
}

function readAtlassianAttribute(
  node: AtlassianDocumentNode,
  name: string,
): string {
  const value = node.attrs?.[name];
  return typeof value === "string" ? value : "";
}

function renderAtlassianChildren(node: AtlassianDocumentNode): string {
  return (node.content ?? []).map(renderAtlassianNode).join("");
}

function renderAtlassianList(
  node: AtlassianDocumentNode,
  marker: string,
): string {
  return (node.content ?? [])
    .map((item) => {
      const itemText = renderAtlassianChildren(item).trim();
      return `${marker} ${itemText.replaceAll("\n", "\n  ")}`;
    })
    .join("\n");
}

function renderAtlassianTableRow(node: AtlassianDocumentNode): string {
  const cellNodes = node.content ?? [];
  const cells = cellNodes.map((cell) =>
    formatMarkdownTableCell(renderAtlassianChildren(cell).trim()),
  );
  const row = `| ${cells.join(" | ")} |`;
  if (cellNodes.every((cell) => cell.type === "tableHeader")) {
    return `${row}\n| ${cells.map(() => "---").join(" | ")} |\n`;
  }

  return `${row}\n`;
}

function renderAtlassianNode(node: AtlassianDocumentNode): string {
  switch (node.type) {
    case "doc":
      return renderAtlassianChildren(node);
    case "text": {
      const link = node.marks?.find((mark) => mark.type === "link");
      return formatSafeMarkdownLink(node.text ?? "", link?.attrs?.href);
    }
    case "hardBreak":
      return "\n";
    case "paragraph":
      return `${renderAtlassianChildren(node)}\n\n`;
    case "heading": {
      const levelValue = node.attrs?.level;
      const level =
        typeof levelValue === "number" && levelValue >= 1 && levelValue <= 6
          ? levelValue
          : 1;
      return `${"#".repeat(level)} ${renderAtlassianChildren(node)}\n\n`;
    }
    case "bulletList":
      return `${renderAtlassianList(node, "-")}\n\n`;
    case "orderedList":
      return `${renderAtlassianList(node, "1.")}\n\n`;
    case "listItem":
    case "tableCell":
    case "tableHeader":
      return renderAtlassianChildren(node);
    case "blockquote": {
      const quote = renderAtlassianChildren(node).trim();
      return `${quote
        .split("\n")
        .map((line) => `> ${line}`)
        .join("\n")}\n\n`;
    }
    case "codeBlock": {
      const language = readAtlassianAttribute(node, "language");
      const code = (node.content ?? [])
        .map((child) => child.text ?? "")
        .join("");
      return `${formatMarkdownCodeBlock(code, language)}\n\n`;
    }
    case "rule":
      return "---\n\n";
    case "table":
      return `${renderAtlassianChildren(node)}\n`;
    case "tableRow":
      return renderAtlassianTableRow(node);
    case "mediaSingle":
      return `${renderAtlassianChildren(node)}\n\n`;
    case "mention": {
      const text = readAtlassianAttribute(node, "text");
      return text || `[Confluence mention: ${readAtlassianAttribute(node, "id")}]`;
    }
    case "status":
      return readAtlassianAttribute(node, "text");
    case "emoji":
      return (
        readAtlassianAttribute(node, "text") ||
        readAtlassianAttribute(node, "shortName")
      );
    case "date":
      return new Date(
        Number(readAtlassianAttribute(node, "timestamp")) * 1000,
      ).toISOString().slice(0, 10);
    case "inlineCard":
    case "blockCard":
      return formatSafeMarkdownLink(
        readAtlassianAttribute(node, "url"),
        readAtlassianAttribute(node, "url"),
      );
    case "media": {
      const alt = readAtlassianAttribute(node, "alt");
      return alt || `[Confluence media: ${readAtlassianAttribute(node, "id")}]`;
    }
    default:
      return renderAtlassianChildren(node);
  }
}

function readConfluenceBody(page: ConfluencePageWithBody): string {
  const documentNode = JSON.parse(
    page.body.atlas_doc_format.value,
  ) as AtlassianDocumentNode;
  return renderAtlassianNode(documentNode)
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export class ConfluenceConnector implements DocumentConnector {
  private readonly accessToken: string;
  private readonly apiBaseUrl: URL;
  private readonly fetchImplementation: typeof fetch;
  private readonly siteUrl: URL;
  private readonly spaceIds: readonly string[];

  constructor(
    options: ConfluenceConnectorOptions,
    fetchImplementation: typeof fetch = fetch,
  ) {
    this.accessToken = options.accessToken;
    this.apiBaseUrl = new URL(
      `/ex/confluence/${encodeURIComponent(options.cloudId)}/wiki/api/v2/`,
      "https://api.atlassian.com",
    );
    this.fetchImplementation = fetchImplementation;
    this.siteUrl = new URL(options.siteUrl);
    this.spaceIds = [...new Set(options.spaceIds)];
  }

  async listDocuments(
    options: ListDocumentsOptions = {},
  ): Promise<DocumentPage> {
    const url = new URL("pages", this.apiBaseUrl);
    url.searchParams.set("limit", (options.pageSize ?? 100).toString());
    url.searchParams.set("status", "current");
    if (options.cursor !== undefined) {
      url.searchParams.set("cursor", options.cursor);
    }
    for (const spaceId of this.spaceIds) {
      url.searchParams.append("space-id", spaceId);
    }

    const { body, response } =
      await fetchConnectorJson<ConfluencePageResponse>(
        this.fetchImplementation,
        "Confluence",
        "list pages",
        url,
        {
          headers: {
            Accept: "application/json",
            Authorization: `Bearer ${this.accessToken}`,
          },
        },
      );

    return {
      documents: body.results.map((page) =>
        mapConfluencePage(page, this.siteUrl),
      ),
      isExhaustive: true,
      nextCursor: findConfluenceNextCursor(body, response),
    };
  }

  async fetchDocumentById(externalId: string): Promise<DocumentBody> {
    const url = new URL(`pages/${encodeURIComponent(externalId)}`, this.apiBaseUrl);
    url.searchParams.set("body-format", "atlas_doc_format");
    const { body: page } = await fetchConnectorJson<ConfluencePageWithBody>(
      this.fetchImplementation,
      "Confluence",
      "fetch a page",
      url,
      {
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${this.accessToken}`,
        },
      },
    );

    return {
      externalId: page.id,
      contents: readConfluenceBody(page),
      externalUpdatedAt: new Date(page.version.createdAt),
    };
  }
}
