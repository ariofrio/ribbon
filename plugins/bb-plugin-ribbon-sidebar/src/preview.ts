export interface PreviewEvent {
  seq: number;
  type: string;
  data: Record<string, unknown>;
}

export const PREVIEW_USER_EVENT_TYPES = [
  "client/turn/requested",
  "system/manager/user_message",
] as const;
export const PREVIEW_ITEM_EVENT_TYPE = "item/completed";

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function joinTextParts(parts: unknown, hidden: (part: Record<string, unknown>) => boolean) {
  if (!Array.isArray(parts)) return "";
  return parts
    .flatMap((part) => {
      const item = record(part);
      return item && item.type === "text" && typeof item.text === "string" && !hidden(item)
        ? [item.text]
        : [];
    })
    .join("");
}

// Mirrors which stored events bb's timeline projects as user or assistant
// conversation rows, so previews keep matching the transcript.
function messageText(event: PreviewEvent): string {
  const data = event.data;
  switch (event.type) {
    case "client/turn/requested": {
      const subject = record(data.systemMessageSubject);
      if (
        data.initiator === "system" &&
        subject?.kind === "tool-call" &&
        subject.suppress === true
      )
        return "";
      return joinTextParts(data.input, (part) => part.visibility === "agent-only");
    }
    case "system/manager/user_message":
      return typeof data.text === "string" ? data.text : "";
    case PREVIEW_ITEM_EVENT_TYPE: {
      const item = record(data.item);
      if (item?.type === "agentMessage")
        return typeof item.text === "string" ? item.text : "";
      if (item?.type === "userMessage") return joinTextParts(item.content, () => false);
      return "";
    }
    default:
      return "";
  }
}

export function previewMessageText(event: PreviewEvent): string | null {
  const text = messageText(event);
  return text.length > 0 ? text : null;
}

function plainText(value: string) {
  return value
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/^\s{0,3}(?:`{3,}|~{3,}).*$/gm, " ")
    .replace(/^\s{0,3}\[[^\]]+\]:\s+\S+.*$/gm, " ")
    .replace(/!\[([^\]]*)\]\[[^\]]*\]/g, "$1")
    .replace(
      /!\[([^\]]*)\]\((?:\\.|[^\\()\n]|\([^()\n]*\))*\)/g,
      "$1",
    )
    .replace(
      /\[([^\]]+)\]\((?:\\.|[^\\()\n]|\([^()\n]*\))*\)/g,
      "$1",
    )
    .replace(/\[([^\]]+)\]\[[^\]]*\]/g, "$1")
    .replace(/<(https?:\/\/[^>]+|mailto:[^>]+)>/g, "$1")
    .replace(/<\/?[A-Za-z][^>]*>/g, " ")
    .replace(/`+([^`\n]+?)`+/g, "$1")
    .replace(/(\*\*|__|~~)(?=\S)([\s\S]*?\S)\1/g, "$2")
    .replace(/(^|[^\w])([*_])(?=\S)([^*_\n]*?\S)\2(?=$|[^\w])/g, "$1$3")
    .replace(/^\s{0,3}(?:#{1,6}\s+|(?:>\s*)+|[-+*]\s+|\d+[.)]\s+)/gm, "")
    .replace(/^\s*\[[ xX]\]\s+/gm, "")
    .replace(/^\s{0,3}(?:={3,}|(?:[-*_]\s*){3,})$/gm, " ")
    .replace(/\\([\\`*{}\[\]()#+\-.!_>~|])/g, "$1")
    .replace(/\s+/gu, " ")
    .trim()
    .slice(0, 500);
}

export function derivePreviewFromEvents(
  events: readonly PreviewEvent[],
): string | null {
  const message = [...events]
    .sort((left, right) => right.seq - left.seq)
    .map((event) => previewMessageText(event))
    .find((text) => text !== null);
  return message ? plainText(message) || null : null;
}
