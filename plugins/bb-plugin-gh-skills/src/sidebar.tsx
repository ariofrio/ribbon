import { useLayoutEffect, useState } from "react";
import { createPortal } from "react-dom";
import { experimental_usePluginId } from "@get-bb/plugin-sdk/app";
import { Button } from "@/vendor/components/ui/button";
import { PROJECT_LIST_ACTION_BUTTON_CLASS } from "@/vendor/components/ui/sidebar-row-classes";
import { cn } from "@/vendor/lib/utils";

type Page = "browse" | "installed";
const stateAttribute = "data-gh-skills-sidebar-state";
const bridgeCss = `
[${stateAttribute}="hidden"] { display: none !important; }
[${stateAttribute}="header"] { visibility: hidden !important; }
[data-framed] [${stateAttribute}="reserve"] { height: 8px !important; min-height: 0 !important; overflow: hidden !important; }
`;

export function SkillsSidebar({ mode, onNavigate, onAvailable }: {
  mode: Page; onNavigate: (page: Page) => void; onAvailable: (available: boolean) => void;
}) {
  const pluginId = experimental_usePluginId();
  const [targets, setTargets] = useState<HTMLElement[]>([]);
  useLayoutEffect(() => {
    const mounts = new Map<Element, { content: Element; node: HTMLElement }>();
    const original = new Map<Element, { state: string | null; inert: string | null; ariaHidden: string | null }>();
    let disposed = false;
    let queued = false;
    let available: boolean | undefined;
    const style = document.createElement("style");
    style.textContent = bridgeCss;
    document.head.append(style);
    const restore = (element: Element) => {
      const previous = original.get(element);
      if (!previous) return;
      for (const [attribute, value] of [[stateAttribute, previous.state], ["inert", previous.inert], ["aria-hidden", previous.ariaHidden]] as const) {
        if (value === null) element.removeAttribute(attribute);
        else element.setAttribute(attribute, value);
      }
      original.delete(element);
    };
    const update = () => {
      if (disposed) return;
      const used = new Set<Element>();
      const bodies = new Set<Element>();
      const suppress = (element: Element, state: "hidden" | "header" | "reserve" = "hidden") => {
        used.add(element);
        if (!original.has(element)) original.set(element, {
          state: element.getAttribute(stateAttribute), inert: element.getAttribute("inert"), ariaHidden: element.getAttribute("aria-hidden"),
        });
        element.setAttribute(stateAttribute, state);
        if (state !== "reserve") { element.setAttribute("inert", ""); element.setAttribute("aria-hidden", "true"); }
      };
      for (const body of Array.from(document.querySelectorAll<HTMLElement>('[data-testid="app-sidebar-body"]'))) {
        if (body.hidden) continue;
        const content = body.querySelector('[data-sidebar="content"]');
        const reserve = body.querySelector('[data-testid="app-sidebar-top-reserve-row"]');
        const resize = body.querySelector('[data-testid="app-sidebar-resize-handle"]');
        if (!content || !reserve || !resize) continue;
        bodies.add(body);
        let mount = mounts.get(body);
        if (!mount || mount.content !== content || mount.node.parentElement !== content) {
          mount?.node.remove();
          const node = document.createElement("div");
          node.dataset.ghSkillsSidebarHost = "";
          // Portals need their own ancestor for BB's plugin-scoped stylesheet.
          node.dataset.bbPlugin = pluginId;
          node.dataset.bbPluginRoot = "";
          content.append(node);
          mount = { content, node };
          mounts.set(body, mount);
        }
        for (const child of Array.from(content.children)) if (child !== mount.node) suppress(child);
        suppress(reserve, "reserve");
        for (const header of Array.from(reserve.querySelectorAll('[data-sidebar-header-slot]'))) suppress(header, "header");
        for (const child of Array.from(body.children)) if (child !== content && child !== reserve && child !== resize) suppress(child);
        for (const footer of Array.from(body.closest('[data-sidebar="sidebar"]')?.querySelectorAll('[data-sidebar="footer"]') ?? [])) suppress(footer);
      }
      for (const [body, mount] of mounts) if (!bodies.has(body)) { mount.node.remove(); mounts.delete(body); }
      for (const element of original.keys()) if (!used.has(element)) restore(element);
      const next = [...mounts.values()].map((mount) => mount.node);
      setTargets((previous) => previous.length === next.length && previous.every((node, index) => node === next[index]) ? previous : next);
      if (available !== Boolean(next.length)) { available = Boolean(next.length); onAvailable(available); }
    };
    const observer = new MutationObserver(() => {
      if (queued || disposed) return;
      queued = true;
      queueMicrotask(() => { queued = false; update(); });
    });
    update();
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["hidden"] });
    return () => {
      disposed = true;
      observer.disconnect();
      for (const element of original.keys()) restore(element);
      for (const mount of mounts.values()) mount.node.remove();
      style.remove();
    };
  }, [pluginId, onAvailable]);

  return targets.map((target, index) => createPortal(
    <nav data-gh-skills-sidebar aria-label="Skills navigation" className="mt-1 space-y-0.5 px-2">
      {(["browse", "installed"] as const).map((page) => <Button key={page} asChild variant="ghost" size="sm"
        className={cn(PROJECT_LIST_ACTION_BUTTON_CLASS, "w-full", mode === page && "bg-sidebar-accent text-sidebar-foreground")}>
        <a href={`/plugins/${encodeURIComponent(pluginId)}/skills/${page}`} aria-current={mode === page ? "page" : undefined}
          onClick={(event) => {
            if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
            event.preventDefault();
            document.querySelector<HTMLElement>('[data-sidebar-mobile-backdrop][data-state="open"]')?.click();
            onNavigate(page);
          }}><span className="min-w-0 flex-1 truncate text-left">{page === "browse" ? "Browse" : "Installed"}</span></a>
      </Button>)}
    </nav>, target, String(index),
  ));
}
