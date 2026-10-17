import { parseDocument } from "yaml";

export function skillDocument(source: string) {
  const frontmatter = /^\uFEFF?---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/u.exec(source);
  if (!frontmatter) return { content: source, description: "", sourcePath: "" };
  try {
    const doc = parseDocument(frontmatter[1]!);
    if (doc.errors.length) return { content: source, description: "", sourcePath: "" };
    const data = doc.toJS({ maxAliasCount: 50 });
    return {
      content: source.slice(frontmatter[0].length),
      description: typeof data?.description === "string" ? data.description : "",
      sourcePath: typeof data?.metadata?.["github-path"] === "string" ? data.metadata["github-path"] : "",
    };
  } catch { return { content: source, description: "", sourcePath: "" }; }
}
