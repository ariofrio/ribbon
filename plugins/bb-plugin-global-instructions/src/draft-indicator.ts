import type { PluginContentScriptContext } from "@get-bb/plugin-sdk/app";
import { DRAFT_SIGNAL, draftStore } from "./draft-store";

export function mountDraftIndicator({ signal }: PluginContentScriptContext) {
  const selector = '[data-testid="settings-sidebar-body"] a[href="/settings/plugins/global-instructions"]';
  const markers = new Map<Element, HTMLSpanElement>();
  let dirty = false;
  let disposed = false;
  let request = 0;

  const render = () => {
    if (disposed) return;
    for (const [link, marker] of markers) {
      if (!dirty || !link.isConnected || marker.parentElement !== link) { marker.remove(); markers.delete(link); }
    }
    if (!dirty) return;
    for (const link of Array.from(document.querySelectorAll(selector))) {
      if (markers.has(link)) continue;
      const marker = document.createElement("span");
      marker.dataset.globalInstructionsUnsaved = "";
      marker.setAttribute("role", "img");
      marker.setAttribute("aria-label", "Unsaved changes");
      marker.title = "Unsaved changes";
      // This node is outside the plugin stylesheet's @scope root.
      Object.assign(marker.style, { display: "inline-block", width: "6px", height: "6px", flexShrink: "0",
        marginInlineStart: "auto", marginInlineEnd: "4px", borderRadius: "50%", backgroundColor: "var(--warning-text, var(--foreground))" });
      link.append(marker);
      markers.set(link, marker);
    }
  };

  const refresh = async () => {
    const current = ++request;
    try {
      const next = await draftStore.hasDrafts();
      if (!disposed && current === request) { dirty = next; render(); }
    } catch { /* The editor reports storage errors; keep any existing indicator. */ }
  };
  const storage = (event: StorageEvent) => { if (event.key === DRAFT_SIGNAL) draftStore.invalidate(); };
  const beforeUnload = (event: BeforeUnloadEvent) => { if (draftStore.needsProtection()) event.preventDefault(); };
  const observer = new MutationObserver(render);
  observer.observe(document.body, { childList: true, subtree: true });
  const unsubscribe = draftStore.subscribe(() => { void refresh(); });
  window.addEventListener("storage", storage);
  window.addEventListener("beforeunload", beforeUnload);
  void refresh();

  const dispose = async () => {
    if (disposed) return;
    disposed = true;
    observer.disconnect();
    unsubscribe();
    window.removeEventListener("storage", storage);
    window.removeEventListener("beforeunload", beforeUnload);
    signal.removeEventListener("abort", abort);
    markers.forEach((marker) => marker.remove());
    markers.clear();
    await draftStore.close();
  };
  const abort = () => { void dispose().catch(() => {}); };
  signal.addEventListener("abort", abort, { once: true });
  if (signal.aborted) abort();
  return dispose;
}
