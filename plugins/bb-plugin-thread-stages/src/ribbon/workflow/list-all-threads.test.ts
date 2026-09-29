import { describe, expect, it, vi } from "vitest";
import { listAllThreads } from "./list-all-threads";

describe("listAllThreads", () => {
  it("collects every page without duplicating or skipping threads", async () => {
    const threads = Array.from({ length: 225 }, (_, index) => ({
      id: `thr_${index}`,
    }));
    const listPage = vi.fn(
      async ({ limit, offset }: { limit: number; offset: number }) =>
        threads.slice(offset, offset + limit),
    );

    await expect(listAllThreads(listPage)).resolves.toEqual(threads);
    expect(listPage.mock.calls).toEqual([
      [{ limit: 100, offset: 0 }],
      [{ limit: 100, offset: 100 }],
      [{ limit: 100, offset: 200 }],
    ]);
  });

  it("requests an empty final page when the total is an exact page multiple", async () => {
    const threads = Array.from({ length: 200 }, (_, index) => ({
      id: `thr_${index}`,
    }));
    const listPage = vi.fn(
      async ({ limit, offset }: { limit: number; offset: number }) =>
        threads.slice(offset, offset + limit),
    );

    await expect(listAllThreads(listPage)).resolves.toEqual(threads);
    expect(listPage).toHaveBeenLastCalledWith({ limit: 100, offset: 200 });
  });
});
