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
    .replace(/<!--[\s\S]*?-->/gu, " ")
    .replace(/!?(?:\[([^\]]*)\])\([^)]*\)/gu, "$1")
    .replace(/`+([^`\n]+)`+/gu, "$1")
    .replace(/(\*\*|__|~~)(?=\S)([\s\S]*?\S)\1/gu, "$2")
    .replace(/^\s{0,3}(?:#{1,6}\s+|(?:>\s*)+|[-+*]\s+|\d+[.)]\s+)/gmu, "")
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
