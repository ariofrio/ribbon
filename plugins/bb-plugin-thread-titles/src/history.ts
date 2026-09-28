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
              "system/thread-provisioning",
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
  // bb's own title step at creation. Threads bb titles without a provisioning
  // transcript never leave "pending".
  let titleStep: "pending" | "generated" | "none" = "pending";
  for (const event of events) {
    const data = record(event.data);
    if (event.type === "system/thread-provisioning") {
      for (const entry of Array.isArray(data.entries) ? data.entries : []) {
        const step = record(entry);
        if (step.key === "metadata-completed")
          titleStep =
            record(step.metadata).titleGenerated === true ? "generated" : "none";
      }
      continue;
    }
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
    titleStep,
  };
}

const MESSAGE_ITEMS = new Set(["userMessage", "agentMessage", "plan"]);
const TOOL_TEXT_LIMIT = 1_000;

// Keep the start and end of long tool text: a title needs what ran and how it
// ended, not every line of an install log.
function trim(value: unknown): unknown {
  if (typeof value === "string")
    return value.length > TOOL_TEXT_LIMIT
      ? `${value.slice(0, TOOL_TEXT_LIMIT / 2)}\n[… ${value.length - TOOL_TEXT_LIMIT} characters trimmed …]\n${value.slice(-TOOL_TEXT_LIMIT / 2)}`
      : value;
  if (Array.isArray(value)) return value.map(trim);
  if (value !== null && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, trim(entry)]),
    );
  return value;
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
      if (typeof item.id !== "string" || item.type === "reasoning") continue;
      const key = `${record(event.scope).turnId ?? ""}:${item.id}`;
      const previous = items.get(key);
      items.set(key, {
        seq: previous?.seq ?? event.seq,
        value: { ...item, partial: event.type !== "item/completed" },
      });
    } else if (
      event.type.startsWith("item/") &&
      !event.type.startsWith("item/reasoning/") &&
      /delta$/i.test(event.type)
    ) {
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
      entries.push({
        seq: event.seq,
        value: trim({ type: event.type, ...data }),
      });
    }
  }
  for (const item of items.values())
    entries.push({
      seq: item.seq,
      value: MESSAGE_ITEMS.has(String(item.value.type))
        ? item.value
        : trim(item.value),
    });
  return entries
    .sort((a, b) => a.seq - b.seq)
    .map((entry) => JSON.stringify(entry.value))
    .join("\n");
}

// The longest run of whole transcript lines, from the start, within maxBytes.
export function opening(history: string, maxBytes: number): string {
  let bytes = -1;
  let end = 0;
  for (const line of history.split("\n")) {
    bytes += Buffer.byteLength(line, "utf8") + 1;
    if (bytes > maxBytes) break;
    end += line.length + 1;
  }
  return history.slice(0, Math.max(0, end - 1));
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
