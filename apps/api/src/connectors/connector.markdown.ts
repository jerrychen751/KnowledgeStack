export function formatSafeMarkdownLink(text: string, href: unknown): string {
  const escapedText = text.replace(/[\\[\]]/g, "\\$&");
  if (typeof href !== "string") {
    return escapedText;
  }

  let url: URL;
  try {
    url = new URL(href);
  } catch {
    return escapedText;
  }

  if (!["http:", "https:", "mailto:"].includes(url.protocol)) {
    return escapedText;
  }

  return `[${escapedText}](<${url.toString()}>)`;
}

export function formatMarkdownTableCell(contents: string): string {
  let backslashCount = 0;
  let escapedContents = "";

  for (const character of contents.replaceAll("\n", " ")) {
    if (character === "\\") {
      backslashCount += 1;
      escapedContents += character;
      continue;
    }

    if (character === "|" && backslashCount % 2 === 0) {
      escapedContents += "\\";
    }
    escapedContents += character;
    backslashCount = 0;
  }

  return escapedContents;
}

export function formatMarkdownCodeBlock(
  contents: string,
  language: string,
): string {
  const backtickRuns = contents.match(/`+/g) ?? [];
  const fenceLength = Math.max(
    3,
    ...backtickRuns.map((backticks) => backticks.length + 1),
  );
  const fence = "`".repeat(fenceLength);
  const safeLanguage = language.replace(/[\r\n`]/g, "");
  return `${fence}${safeLanguage}\n${contents}\n${fence}`;
}
