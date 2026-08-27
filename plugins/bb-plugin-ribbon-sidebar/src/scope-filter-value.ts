import type { GroupRef } from "./view-state";

export type ScopeFilterValue = GroupRef | null;

export function serializeScopeFilter(value: ScopeFilterValue): string | null {
  if (value === null) return null;
  return `${value.groupingKey}/${value.groupId}`;
}
