export interface PreviewRow {
  kind: string;
  sourceSeqEnd: number;
  role?: "user" | "assistant";
  text?: string;
  children?: readonly PreviewRow[] | null;
}

function flatten(rows: readonly PreviewRow[]): PreviewRow[] {
  return rows.flatMap((row) => [
    row,
    ...(row.children ? flatten(row.children) : []),
  ]);
}

function plainText(value: string) {
  return value
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/^\s{0,3}(?:`{3,}|~{3,}).*$/gm, " ")
    .replace(/^\s{0,3}\[[^\]]+\]:\s+\S+.*$/gm, " ")
    .replace(/!\[([^\]]*)\]\[[^\]]*\]/g, "$1")
    .replace(
      /!\[([^\]]*)\]\((?:\\.|[^\\()\n]|\([^()\n]*\))*\)/g,
      "$1",
    )
    .replace(
      /\[([^\]]+)\]\((?:\\.|[^\\()\n]|\([^()\n]*\))*\)/g,
      "$1",
    )
    .replace(/\[([^\]]+)\]\[[^\]]*\]/g, "$1")
    .replace(/<(https?:\/\/[^>]+|mailto:[^>]+)>/g, "$1")
    .replace(/<\/?[A-Za-z][^>]*>/g, " ")
    .replace(/`+([^`\n]+?)`+/g, "$1")
    .replace(/(\*\*|__|~~)(?=\S)([\s\S]*?\S)\1/g, "$2")
    .replace(/(^|[^\w])([*_])(?=\S)([^*_\n]*?\S)\2(?=$|[^\w])/g, "$1$3")
    .replace(/^\s{0,3}(?:#{1,6}\s+|(?:>\s*)+|[-+*]\s+|\d+[.)]\s+)/gm, "")
    .replace(/^\s*\[[ xX]\]\s+/gm, "")
    .replace(/^\s{0,3}(?:={3,}|(?:[-*_]\s*){3,})$/gm, " ")
    .replace(/\\([\\`*{}\[\]()#+\-.!_>~|])/g, "$1")
    .replace(/\s+/gu, " ")
    .trim()
    .slice(0, 500);
}

export function derivePreview(rows: readonly PreviewRow[]): string | null {
  const message = flatten(rows)
    .filter(
      (row) =>
        row.kind === "conversation" &&
        (row.role === "user" || row.role === "assistant"),
    )
    .sort((left, right) => right.sourceSeqEnd - left.sourceSeqEnd)[0];
  if (!message?.text) return null;
  return plainText(message.text) || null;
}
