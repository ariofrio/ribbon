/**
 * This plugin draws from two places that cannot hear each other: a React slot
 * in the thread header, and a content script outside bb's provider tree. Neither
 * can join the other's realtime channel, so an edit is announced here — which
 * also carries it to other windows of the same client.
 */
export const ICONS_CHANNEL = "bb.icons";

export function announceIconsChanged(): void {
  try {
    const channel = new BroadcastChannel(ICONS_CHANNEL);
    channel.postMessage({ type: "icons-changed" });
    channel.close();
  } catch {
    // Clients without BroadcastChannel fall back to the listener's own
    // refresh-on-focus.
  }
}

/**
 * Calls back whenever an icon is edited, here or in another window of the
 * same client. Clients without BroadcastChannel still catch up on focus.
 */
export function subscribeToIconChanges(onChange: () => void): () => void {
  let channel: BroadcastChannel | null = null;
  try {
    channel = new BroadcastChannel(ICONS_CHANNEL);
    channel.onmessage = () => onChange();
  } catch {
    // Older clients fall back to the focus listener below.
  }
  const onFocus = () => onChange();
  window.addEventListener("focus", onFocus);
  return () => {
    channel?.close();
    window.removeEventListener("focus", onFocus);
  };
}
