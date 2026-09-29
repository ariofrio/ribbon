interface OrderableGrouping {
  groupingKey: string;
  pluralLabel: string;
}

function builtinRank(groupingKey: string): number {
  if (groupingKey === "builtin:sections") return 0;
  if (groupingKey === "builtin:projects") return 1;
  return 2;
}

export function compareGroupingOrder(
  left: OrderableGrouping,
  right: OrderableGrouping,
): number {
  const rank = builtinRank(left.groupingKey) - builtinRank(right.groupingKey);
  if (rank !== 0) return rank;
  if (builtinRank(left.groupingKey) < 2) return 0;
  return (
    left.pluralLabel.localeCompare(right.pluralLabel, "en", {
      sensitivity: "base",
    }) || left.groupingKey.localeCompare(right.groupingKey, "en")
  );
}

export function orderedGroupings<T extends OrderableGrouping>(
  groupings: readonly T[],
): T[] {
  return [...groupings].sort(compareGroupingOrder);
}
