/** Notify the header, app overlay, and other windows of local icon edits. */
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
