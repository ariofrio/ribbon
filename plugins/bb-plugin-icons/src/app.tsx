import type { IconSvgElement } from "@hugeicons/react";
import {
  definePluginApp,
  experimental_useSidebarThreads,
  useRealtime,
  useRpc,
  useSettings,
  type PluginThreadHeaderActionProps,
} from "@get-bb/plugin-sdk/app";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { createRoot } from "react-dom/client";
import { afterPluginFrame } from "./after-plugin-frame";
import { announceIconsChanged } from "./broadcast";
import { installIconPortal } from "./header-dom";
import { IconGlyph } from "./IconGlyph";
import { IconPicker, type CatalogIcon } from "./IconPicker";
import { Icons } from "./Icons";
import { iconsRpc } from "./icons-client";
import type { rpcContract } from "./server";
import { observeSidebarIconAnchors, type SidebarAnchor } from "./sidebar-dom";
import {
  defaultIcon,
  isEditable,
  type IconColor,
  type IconOwner,
  type StoredIcon,
} from "./store";

interface IconView extends StoredIcon {
  glyph: IconSvgElement;
}

interface IconDefaults {
  project: IconSvgElement;
  personal: IconSvgElement;
  section: IconSvgElement;
}

function defaultGlyph(
  owner: IconOwner,
  defaults: IconDefaults | null,
): IconSvgElement | undefined {
  if (defaults === null) return undefined;
  if (owner.kind === "section") return defaults.section;
  return defaultIcon(owner) === "bubble-chat"
    ? defaults.personal
    : defaults.project;
}

function IconHeaderAction({ projectId }: PluginThreadHeaderActionProps) {
  const owner: IconOwner = { kind: "project", id: projectId };
  const rpc = useRpc<typeof rpcContract>();
  const settings = useSettings();
  const sidebar = experimental_useSidebarThreads();
  const markerRef = useRef<HTMLSpanElement>(null);
  const [target, setTarget] = useState<HTMLElement | null>(null);
  const [icons, setIcons] = useState<readonly IconView[]>([]);
  const [defaults, setDefaults] = useState<IconDefaults | null>(null);
  const [picking, setPicking] = useState(false);
  const [catalog, setCatalog] = useState<readonly CatalogIcon[]>([]);
  const [loadingCatalog, setLoadingCatalog] = useState(false);
  /**
   * Set when the pointer reaches the icon, before any click.
   *
   * The catalog is 2,532 icons and deliberately not in the bundle, so opening
   * cold means the popover arrives, then its categories and grid land a beat
   * later — one movement answered by a second. Fetching on approach keeps the
   * bundle small and still has the picker whole by the time it opens.
   */
  const [wanted, setWanted] = useState(false);

  const refresh = useCallback(async () => {
    const state = await rpc.call("listIcons", null);
    setIcons(state.icons);
    setDefaults(state.defaults);
  }, [rpc]);

  // The catalog is big, so it is fetched the first time the picker opens.
  useEffect(() => {
    if ((!picking && !wanted) || catalog.length > 0 || loadingCatalog) return;
    setLoadingCatalog(true);
    void rpc
      .call("listIconCatalog", null)
      .then(({ icons: entries }) => setCatalog(entries))
      .finally(() => setLoadingCatalog(false));
  }, [catalog.length, loadingCatalog, picking, rpc, wanted]);

  useEffect(() => {
    void refresh();
  }, [refresh]);
  // Other clients report through this plugin's realtime channel; pass it on so
  // plugins that cannot join that channel still see the change.
  useRealtime("icons-changed", () => {
    void refresh();
    announceIconsChanged();
  });

  // Undefined while settings load: the icon has always been here, so it
  // stays until the user is known to have turned it off, rather than blinking
  // in on every thread open.
  const showInHeader = settings.values?.showInThreadHeader !== false;

  useLayoutEffect(() => {
    const marker = markerRef.current;
    if (marker === null || !showInHeader) return;
    const mount = installIconPortal(marker);
    setTarget(mount?.target ?? null);
    return () => {
      setTarget(null);
      mount?.cleanup();
    };
  }, [projectId, showInHeader]);

  const chosen = icons.find(
    (item) => item.kind === owner.kind && item.id === owner.id,
  );
  const icon = chosen?.icon ?? defaultIcon(owner);
  const color = chosen?.color ?? null;
  const glyph = chosen?.glyph ?? defaultGlyph(owner, defaults);
  const editable = isEditable(owner);
  const ownerName =
    sidebar.projects.find((project) => project.id === projectId)?.name ??
    "this project";

  // Picking an icon and then a color lands two updates in one tick, so the
  // pending choice is tracked in a ref rather than read back from state.
  const pendingRef = useRef({ icon, color });
  useEffect(() => {
    pendingRef.current = { icon, color };
  }, [color, icon]);

  const apply = (next: { icon?: string; color?: IconColor | null }) => {
    const nextIcon = next.icon ?? pendingRef.current.icon;
    const nextColor =
      next.color === undefined ? pendingRef.current.color : next.color;
    pendingRef.current = { icon: nextIcon, color: nextColor };
    const nextGlyph =
      catalog.find((entry) => entry.name === nextIcon)?.glyph ?? glyph;
    setIcons((current) => [
      ...current.filter(
        (item) => !(item.kind === owner.kind && item.id === owner.id),
      ),
      { ...owner, icon: nextIcon, color: nextColor, glyph: nextGlyph ?? [] },
    ]);
    announceIconsChanged();
    void rpc
      .call("setIcon", { ...owner, icon: nextIcon, color: nextColor })
      .catch(() => void refresh());
  };

  const reset = () => {
    pendingRef.current = { icon: defaultIcon(owner), color: null };
    setIcons((current) =>
      current.filter(
        (item) => !(item.kind === owner.kind && item.id === owner.id),
      ),
    );
    announceIconsChanged();
    void rpc.call("clearIcon", owner).catch(() => void refresh());
  };

  const control = editable ? (
    <button
      type="button"
      aria-label={`Icon for ${ownerName}`}
      title="Change project icon"
      onPointerEnter={() => setWanted(true)}
      onFocus={() => setWanted(true)}
      // The desktop header is a window drag region, so an interactive control
      // inside it has to opt out or Electron swallows the click.
      //
      // No color of its own, like the sidebar's: the icon then reads at the
      // same weight as the thread title it sits beside, which is where bb puts
      // its own header controls too. The hover and open states stay, so the
      // icon still lifts if it ever inherits something dimmer.
      className="relative z-50 -ml-0.5 flex size-7 cursor-pointer items-center justify-center rounded-md transition-colors duration-150 hover:duration-0 hover:bg-state-hover hover:text-foreground data-[state=open]:bg-state-active data-[state=open]:text-foreground [app-region:no-drag] [-webkit-app-region:no-drag]"
    >
      <IconGlyph icon={{ name: icon, glyph, color }} />
    </button>
  ) : (
    <span className="-ml-0.5 flex size-6 items-center justify-center">
      <IconGlyph icon={{ name: icon, glyph, color }} />
    </span>
  );

  return (
    <>
      <span ref={markerRef} className="hidden" />
      {target === null
        ? null
        : createPortal(
            editable ? (
              <IconPicker
                catalog={catalog}
                loading={loadingCatalog}
                open={picking}
                onOpenChange={setPicking}
                ownerName={ownerName}
                icon={icon}
                defaultIcon={defaultIcon(owner)}
                color={color}
                onPick={(next) => apply({ icon: next })}
                onPickColor={(next) => apply({ color: next })}
                onReset={reset}
                trigger={control}
              />
            ) : (
              control
            ),
            target,
          )}
    </>
  );
}

export default definePluginApp((app) => {
  app.slots.experimental_threadHeaderAction({
    id: "project-icon",
    title: "Project icon",
    component: IconHeaderAction,
  });

  // bb has no always-mounted React slot, and a thread-header action only
  // exists on a thread route, so the sidebar half runs as a content script.
  // Nothing from the SDK reaches here — no useRpc, no useSettings — which is
  // why this half talks to its own backend over fetch.
  app.contentScripts.register({
    id: "sidebar-icons",
    /**
     * Answers bb with its disposer first, and reads its settings after.
     *
     * bb holds a plugin attributed for as long as `mount` is unresolved, and
     * while any plugin is attributed it refuses to let a React-owned node into
     * a container React does not own. Reading the settings before returning
     * therefore held the whole app in that state for the length of a round
     * trip — a second or more on a cold start — and every plugin drawing into
     * bb's chrome in the meantime was refused, this collection's crumbs
     * included. bb's contract takes a disposer straight back, so the read
     * happens after it, and the window closes on the next microtask.
     */
    mount({ pluginId, signal }) {
      const rpc = iconsRpc(pluginId);
      let teardown: (() => void) | null = null;
      let disposed = false;

      const dispose = () => {
        disposed = true;
        const stop = teardown;
        teardown = null;
        stop?.();
      };
      // Registered before anything can be placed, so an abort that arrives
      // mid-read is seen by the read rather than lost.
      signal.addEventListener("abort", dispose, { once: true });

      const place = () => {
        const host = document.createElement("div");
        host.style.display = "none";
        document.body.append(host);
        const root = createRoot(host);

        /**
         * Rendering is pushed off the call that asked for it, so a render is
         * never committed from inside bb's own mutation callback, and a burst
         * of sidebar changes redraws once rather than once each.
         *
         * It does not leave bb's guard: attribution is wall-clock, not stack,
         * so a frame that lands inside another plugin's mount is refused like
         * any other. See `after-plugin-frame.ts`. These anchors have never been
         * seen refused — 240 inserts over 40 loads, none blocked, in runs where
         * the crumbs beside them were blocked 68 times — because a draw is
         * scheduled from a settings read that has already ended, and a redraw
         * comes from an observer built outside anyone's window. So there is no
         * recovery here, as there is nothing yet to recover from.
         */
        let cancel: (() => void) | undefined;
        let pending: SidebarAnchor[] = [];
        const draw = (anchors: SidebarAnchor[]) => {
          pending = anchors;
          if (cancel !== undefined) return;
          cancel = afterPluginFrame(() => {
            cancel = undefined;
            root.render(<Icons anchors={pending} rpc={rpc} />);
          });
        };
        draw([]);
        const stop = observeSidebarIconAnchors(draw);

        teardown = () => {
          cancel?.();
          // React owns nodes inside bb's sidebar, so it unmounts before the
          // anchors holding them are taken back out.
          root.unmount();
          stop();
          host.remove();
        };
      };

      // Still asked before a single node is placed: an anchor left in bb's
      // sidebar would space the group label out even with nothing drawn in it.
      // bb never applies a settings edit without a reload, so one read holds,
      // and `iconsRpc` answers null rather than throwing, so this cannot
      // reject.
      void rpc.listPlacements().then((placements) => {
        if (disposed || signal.aborted) return;
        if (placements?.showInSidebar === false) return;
        place();
      });

      return dispose;
    },
  });
});
