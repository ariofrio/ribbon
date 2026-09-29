/** Partition retained section order without re-ranking working threads. */
export function sectionBands<T>(
  rows: readonly T[],
  stage: (row: T) => string | undefined,
  completedAt: (row: T) => number,
): { main: T[]; deferred: T[]; completed: T[] } {
  const main: T[] = [];
  const deferred: T[] = [];
  const completed: T[] = [];
  for (const row of rows) {
    if (stage(row) === "Completed") completed.push(row);
    else if (stage(row) === "Deferred") deferred.push(row);
    else main.push(row);
  }
  completed.sort((left, right) => completedAt(right) - completedAt(left));
  return { main, deferred, completed };
}
