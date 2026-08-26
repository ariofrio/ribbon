export type ScopeFilterValue =
  | { kind: "project"; id: string }
  | { kind: "section"; id: string }
  | { kind: "uncategorized" }
  | null;

export function serializeScopeFilter(value: ScopeFilterValue): string | null {
  if (value === null) return null;
  if (value.kind === "uncategorized") return value.kind;
  return `${value.kind}:${value.id}`;
}
