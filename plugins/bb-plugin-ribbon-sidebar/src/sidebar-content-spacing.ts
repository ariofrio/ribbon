const RIBBON_SIDEBAR_ROOT_SELECTOR = "[data-ribbon-sidebar-root]";
const SIDEBAR_CONTENT_SELECTOR = '[data-sidebar="content"]';
interface InlineStyleValue {
  priority: string;
  value: string;
}

function readInlineStyle(
  element: HTMLElement,
  property: string,
): InlineStyleValue {
  return {
    value: element.style.getPropertyValue(property),
    priority: element.style.getPropertyPriority(property),
  };
}

function restoreInlineStyle(
  element: HTMLElement,
  property: string,
  previous: InlineStyleValue,
): void {
  if (previous.value === "") {
    element.style.removeProperty(property);
    return;
  }
  element.style.setProperty(property, previous.value, previous.priority);
}

export function mountSidebarContentSpacing(signal: AbortSignal): () => void {
  let disposed = false;
  let styledRoot: HTMLElement | null = null;
  let styledContent: HTMLElement | null = null;
  let previousContentOverflowX: InlineStyleValue | null = null;

  function restore(): void {
    if (styledContent !== null && previousContentOverflowX !== null) {
      restoreInlineStyle(styledContent, "overflow-x", previousContentOverflowX);
    }
    styledRoot = null;
    styledContent = null;
    previousContentOverflowX = null;
  }

  function sync(): void {
    if (disposed) return;
    const nextRoot = document.querySelector<HTMLElement>(
      RIBBON_SIDEBAR_ROOT_SELECTOR,
    );
    const nextContent =
      nextRoot?.closest<HTMLElement>(SIDEBAR_CONTENT_SELECTOR) ?? null;
    if (nextRoot === styledRoot && nextContent === styledContent) {
      return;
    }

    restore();
    if (nextRoot === null || nextContent === null) return;

    styledRoot = nextRoot;
    styledContent = nextContent;
    previousContentOverflowX = readInlineStyle(nextContent, "overflow-x");
    nextContent.style.setProperty("overflow-x", "hidden");
  }

  const observer = new MutationObserver(sync);
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
  });

  function dispose(): void {
    if (disposed) return;
    disposed = true;
    observer.disconnect();
    signal.removeEventListener("abort", dispose);
    restore();
  }

  signal.addEventListener("abort", dispose, { once: true });
  sync();
  return dispose;
}
