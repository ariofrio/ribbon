// @vitest-environment jsdom
import "fake-indexeddb/auto";
import { afterEach, expect, it } from "vitest";
import { DraftStore, type StoredDraft } from "./draft-store";

const stores: DraftStore[] = [];
afterEach(async () => { await Promise.all(stores.splice(0).map(store => store.close())); });
function store(name = crypto.randomUUID()) {
  const value = new DraftStore(name);
  stores.push(value);
  return value;
}
function record(instructions = "Unsaved instructions"): StoredDraft {
  return { version: 1, id: crypto.randomUUID(), base: { path: "/server/AGENTS.md", instructions: "Original", revision: "original" }, instructions, mode: "plain" };
}

it("persists large exact source and its base revision for a fresh frontend", async () => {
  const name = crypto.randomUUID();
  const first = store(name);
  const draft = record("日本語 🎉\r\n".repeat(100_000));
  await first.write(draft);
  await first.close();
  const restarted = store(name);
  expect(await restarted.read(draft.base.path)).toEqual(draft);
  expect(await restarted.hasDrafts()).toBe(true);
  await restarted.clear(draft.base.path, draft.id);
  expect(await store(name).read(draft.base.path)).toBeNull();
});

it("serializes edits and removes a draft when discarded immediately after typing", async () => {
  const name = crypto.randomUUID();
  const first = store(name);
  const initial = record("First");
  const latest = record("Latest");
  await Promise.all([first.write(initial), first.write(latest), first.clear(latest.base.path, latest.id)]);
  expect(first.needsProtection()).toBe(false);
  expect(await store(name).hasDrafts()).toBe(false);
});

it("does not erase another window's newer draft when saving an older one", async () => {
  const name = crypto.randomUUID();
  const first = store(name);
  const second = store(name);
  const older = record("Older draft");
  const newer = record("Newer draft");
  await first.write(older);
  await second.write(newer);
  await first.clear(older.base.path, older.id);
  expect(await store(name).read(newer.base.path)).toEqual(newer);
});

it("keeps an in-memory draft and marks it unsafe to close when storage fails", async () => {
  const broken = store();
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, "indexedDB")!;
  Object.defineProperty(globalThis, "indexedDB", { configurable: true, value: undefined });
  const draft = record();
  try {
    await expect(broken.write(draft)).rejects.toThrow("unavailable");
    expect(await broken.read(draft.base.path)).toEqual(draft);
    expect(broken.needsProtection()).toBe(true);
  } finally { Object.defineProperty(globalThis, "indexedDB", descriptor); }
});
