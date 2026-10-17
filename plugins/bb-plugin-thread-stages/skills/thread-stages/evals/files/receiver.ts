type Store = { insert: (event: { id: string }) => Promise<void> };

export async function receive(event: { id: string }, store: Store, failAfterCommit: boolean) {
  await store.insert(event);
  if (failAfterCommit) return new Response("temporary failure", { status: 503 });
  return new Response("accepted", { status: 200 });
}
