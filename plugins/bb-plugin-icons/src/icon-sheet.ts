import { decorationStylesheet, iconStylesheet, type IconDefaults } from "./icon-css";
import type { IconColor, IconOwnerKind } from "./store";
import type { IconSvgElement } from "@hugeicons/react";

interface IconsView {
  icons: readonly {
    kind: IconOwnerKind;
    id: string;
    color: IconColor | null;
    glyph: IconSvgElement;
  }[];
  defaults: IconDefaults;
}

interface PublishOptions {
  /** Null when the read failed; the sheet then stays as it was. */
  load: () => Promise<IconsView | null>;
  /** Calls back when someone edits an icon. */
  subscribe?: (onChange: () => void) => () => void;
  document?: Document;
}

const READY_ATTRIBUTE = "data-ribbon-icons-ready";

/**
 * Publishes every chosen icon as CSS, for any surface that marks its own box.
 *
 * A consumer draws its own element and names the owner on it; the glyph
 * arrives through the cascade, with no scan, observer, or node per row.
 */
export function publishIconStylesheet({
  load,
  subscribe,
  document: target = document,
}: PublishOptions): () => void {
  const style = target.createElement("style");
  style.dataset.ribbonIcons = "";
  let disposed = false;

  const refresh = async () => {
    const view = await load();
    if (disposed || view === null) return;
    style.textContent = `${decorationStylesheet(view.defaults)}\n${iconStylesheet(view)}`;
    if (style.parentNode === null) target.head.append(style);
    // Only once the sheet is there: a consumer keys off this to decide whether
    // to draw at all, and an early marker would show it empty boxes.
    target.documentElement.setAttribute(READY_ATTRIBUTE, "");
  };

  void refresh();
  const unsubscribe = subscribe?.(() => void refresh());

  return () => {
    disposed = true;
    unsubscribe?.();
    style.remove();
    target.documentElement.removeAttribute(READY_ATTRIBUTE);
  };
}
