const THREAD_PAGE_SIZE = 100;
const MAX_THREADS = 10_000;

interface ThreadPage {
  limit: number;
  offset: number;
}

export async function listAllThreads<T>(
  listPage: (page: ThreadPage) => Promise<readonly T[]>,
): Promise<T[]> {
  const threads: T[] = [];

  while (threads.length <= MAX_THREADS) {
    const page = await listPage({
      limit: THREAD_PAGE_SIZE,
      offset: threads.length,
    });
    threads.push(...page);

    if (page.length < THREAD_PAGE_SIZE) return threads;
  }

  throw new Error(`Thread list exceeds ${MAX_THREADS} entries.`);
}
