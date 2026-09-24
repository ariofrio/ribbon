import { createHash } from "node:crypto";
import type { BbPluginApi } from "@get-bb/plugin-sdk";

export type Sdk = BbPluginApi["sdk"];
export type Thread = Awaited<ReturnType<Sdk["threads"]["get"]>>;
export type Event = Awaited<
  ReturnType<Sdk["threads"]["events"]["list"]>
>[number];

export function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export async function readEvents(
  sdk: Sdk,
  threadId: string,
  requestsOnly = false,
): Promise<Event[]> {
  const latest = await sdk.threads.events.list({
    threadId,
    order: "desc",
    limit: "1",
  });
  const upper = latest[0]?.seq ?? 0;
  const events: Event[] = [];
  let cursor = 0;
  while (cursor < upper) {
    const page = await sdk.threads.events.list({
      threadId,
      order: "asc",
      afterSeq: String(cursor),
      beforeSeq: String(upper + 1),
      limit: "100",
      ...(requestsOnly
        ? {
            types: [
              "client/turn/requested",
              "client/turn/rejected",
              "system/operation",
              "turn/completed",
            ],
          }
        : {}),
    });
    if (!page.length) break;
    const next = page[page.length - 1]!.seq;
    if (next <= cursor)
      throw new Error("Thread history cursor did not advance");
    events.push(...page);
    cursor = next;
  }
  return events;
}

export function userActivity(events: Event[]) {
  const rejected = new Set(
    events
      .filter((e) => e.type === "client/turn/rejected")
      .map((e) => record(e.data).requestId),
  );
  const seen = new Set<unknown>();
  let count = 0;
  let firstUserSeq: number | undefined;
  for (const event of events) {
    const data = record(event.data);
    if (
      event.type !== "client/turn/requested" ||
      data.initiator !== "user" ||
      data.retryOfRequestId ||
      rejected.has(data.requestId) ||
      seen.has(data.requestId)
    )
      continue;
    firstUserSeq ??= event.seq;
    seen.add(data.requestId);
    count += Array.isArray(data.inputGroups) ? data.inputGroups.length : 1;
  }
  return {
    count,
    firstTurnEnded: firstUserSeq !== undefined && events.some(
      (event) => event.type === "turn/completed" && event.seq > firstUserSeq,
    ),
  };
}

export function transcript(events: Event[]): string {
  const entries: Array<{ seq: number; value: unknown }> = [];
  const items = new Map<
    string,
    { seq: number; value: Record<string, unknown> }
  >();
  for (const event of events) {
    const data = record(event.data);
    if (event.type === "client/turn/requested") {
      entries.push({
        seq: event.seq,
        value: { role: data.initiator, input: data.inputGroups ?? data.input },
      });
    } else if (
      event.type === "item/started" ||
      event.type === "item/completed"
    ) {
      const item = record(data.item);
      if (typeof item.id !== "string") continue;
      const key = `${record(event.scope).turnId ?? ""}:${item.id}`;
      const previous = items.get(key);
      items.set(key, {
        seq: previous?.seq ?? event.seq,
        value: { ...item, partial: event.type !== "item/completed" },
      });
    } else if (event.type.startsWith("item/") && /delta$/i.test(event.type)) {
      const id = data.itemId;
      if (typeof id !== "string" || typeof data.delta !== "string") continue;
      const key = `${record(event.scope).turnId ?? ""}:${id}`;
      const item = items.get(key) ?? {
        seq: event.seq,
        value: { id, partial: true },
      };
      item.value[event.type] =
        String(item.value[event.type] ?? "") + data.delta;
      items.set(key, item);
    } else if (
      [
        "system/manager/user_message",
        "system/interaction/lifecycle",
        "system/permissionGrant/lifecycle",
        "system/userQuestion/lifecycle",
        "system/error",
        "system/thread/interrupted",
      ].includes(event.type) ||
      event.type.startsWith("item/backgroundTask/") ||
      event.type === "system/operation"
    ) {
      entries.push({ seq: event.seq, value: { type: event.type, ...data } });
    }
  }
  entries.push(...items.values());
  return entries
    .sort((a, b) => a.seq - b.seq)
    .map((entry) => JSON.stringify(entry.value))
    .join("\n");
}

// Requests survive bb's delta pruning; appended turns do not invalidate a snapshot.
export function intentFingerprint(events: Event[], through: number): string {
  return createHash("sha256")
    .update(
      JSON.stringify(
        events
          .filter(
            (event) =>
              (event.seq <= through &&
                ["client/turn/requested", "client/turn/rejected"].includes(
                  event.type,
                )) ||
              (event.type === "system/operation" &&
                record(event.data).operation === "context_clear"),
          )
          .map((event) => ({
            seq: event.seq,
            type: event.type,
            data: event.data,
          })),
      ),
    )
    .digest("hex");
}
