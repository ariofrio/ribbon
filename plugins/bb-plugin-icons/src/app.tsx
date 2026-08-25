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
import type { Placement } from "./decorate";
import { announceIconsChanged, subscribeToIconChanges } from "./broadcast";
import { publishIconStylesheet } from "./icon-sheet";
import { installIconPortal } from "./header-dom";
import { IconGlyph } from "./IconGlyph";
import { IconPicker, type CatalogIcon } from "./IconPicker";
import { Icons } from "./Icons";
import { iconsRpc } from "./icons-client";
import { observeCrumbAnchors, type CrumbAnchor } from "./crumb-anchors";
import { PLACEMENTS } from "./placements";
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

function HeaderIcon({
  owner,
  ownerName,
  icons,
  defaults,
  catalog,
  loadingCatalog,
  onWanted,
  onApply,
  onReset,
}: {
  owner: IconOwner;
  ownerName: string;
  icons: readonly IconView[];
  defaults: IconDefaults | null;
  catalog: readonly CatalogIcon[];
  loadingCatalog: boolean;
  onWanted(): void;
  onApply(owner: IconOwner, next: { icon?: string; color?: IconColor | null }): void;
  onReset(owner: IconOwner): void;
}) {
  const [picking, setPicking] = useState(false);
  const chosen = icons.find(
    (item) => item.kind === owner.kind && item.id === owner.id,
  );
  const icon = chosen?.icon ?? defaultIcon(owner);
  const color = chosen?.color ?? null;
  const glyph = chosen?.glyph ?? defaultGlyph(owner, defaults);
  const editable = isEditable(owner);

  const control = editable ? (
    <button
      type="button"
      aria-label={`Icon for ${ownerName}`}
      title={owner.kind === "section" ? "Change section icon" : "Change project icon"}
      onPointerEnter={onWanted}
      onFocus={onWanted}
      // The desktop header is a window drag region, so an interactive control
      // inside it has to opt out or Electron swallows the click.
      //
      // No color of its own, so the icon inherits the weight of the title it
      // sits beside. The hover and open states still lift it wherever it
      // inherits something dimmer.
      className="relative z-50 -ml-0.5 flex size-7 cursor-pointer items-center justify-center rounded-md transition-colors duration-150 hover:duration-0 hover:bg-state-hover hover:text-foreground data-[state=open]:bg-state-active data-[state=open]:text-foreground [app-region:no-drag] [-webkit-app-region:no-drag]"
    >
      <IconGlyph icon={{ name: icon, glyph, color }} />
    </button>
  ) : (
    <span className="-ml-0.5 flex size-6 items-center justify-center">
      <IconGlyph icon={{ name: icon, glyph, color }} />
    </span>
  );

  if (!editable) return control;
  return (
    <IconPicker
      catalog={catalog}
      loading={loadingCatalog}
      open={picking}
      onOpenChange={(next) => {
        setPicking(next);
        if (next) onWanted();
      }}
      ownerName={ownerName}
      icon={icon}
      defaultIcon={defaultIcon(owner)}
      stored={chosen !== undefined}
      color={color}
      onPick={(next) => onApply(owner, { icon: next })}
      onPickColor={(next) => onApply(owner, { color: next })}
      onReset={() => onReset(owner)}
      trigger={control}
    />
  );
}

function IconHeaderAction({ threadId, projectId }: PluginThreadHeaderActionProps) {
  const rpc = useRpc<typeof rpcContract>();
  const settings = useSettings();
  const sidebar = experimental_useSidebarThreads();
  const markerRef = useRef<HTMLSpanElement>(null);
  const [target, setTarget] = useState<HTMLElement | null>(null);
  const [icons, setIcons] = useState<readonly IconView[]>([]);
  const [defaults, setDefaults] = useState<IconDefaults | null>(null);
  const [catalog, setCatalog] = useState<readonly CatalogIcon[]>([]);
  const [loadingCatalog, setLoadingCatalog] = useState(false);
  const [anchors, setAnchors] = useState<readonly CrumbAnchor[]>([]);
  /**
   * Set when the pointer reaches the icon, before any click.
   *
   * The catalog is 3,525 icons and deliberately not in the bundle, so opening
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
    if (!wanted || catalog.length > 0 || loadingCatalog) return;
    setLoadingCatalog(true);
    void rpc
      .call("listIconCatalog", null)
      .then(({ icons: entries }) => setCatalog(entries))
      .finally(() => setLoadingCatalog(false));
  }, [catalog.length, loadingCatalog, rpc, wanted]);

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

  /**
   * The Breadcrumbs plugin leaves a marked, empty span beside each crumb, and
   * the icons belong in those. With no anchors, because that plugin is absent
   * or every crumb is off, the header gets one icon of its own.
   */
  useEffect(() => {
    if (!showInHeader) return;
    return observeCrumbAnchors(setAnchors);
  }, [showInHeader]);

  const lone = anchors.length === 0;
  /**
   * With no crumb to sit beside, the icon is the thread's project.
   *
   * Not the section it may be filed under: a project is what a thread belongs
   * to, and bb's personal project — which cannot be given an icon — would
   * otherwise be drawn as whatever section its thread happened to be in.
   */
  const loneOwner: IconOwner = { kind: "project", id: projectId };
  useLayoutEffect(() => {
    const marker = markerRef.current;
    if (marker === null || !showInHeader || !lone) {
      setTarget(null);
      return;
    }
    const mount = installIconPortal(marker);
    setTarget(mount?.target ?? null);
    return () => {
      setTarget(null);
      mount?.cleanup();
    };
  }, [lone, projectId, showInHeader]);

  const nameOf = useCallback(
    (owner: IconOwner) =>
      owner.kind === "project"
        ? (sidebar.projects.find((project) => project.id === owner.id)?.name ??
          "this project")
        : "this section",
    [sidebar.projects],
  );

  /**
   * What the icons will be, ahead of the render that shows it.
   *
   * Picking an icon and then a color lands two updates in one tick, and the
   * second has to see the first. That read cannot happen inside a state
   * updater: React may run one more than once per update, and each extra run
   * would repeat the write below.
   */
  const pendingRef = useRef<readonly IconView[]>([]);
  useEffect(() => {
    pendingRef.current = icons;
  }, [icons]);

  const apply = useCallback(
    (owner: IconOwner, next: { icon?: string; color?: IconColor | null }) => {
      const current = pendingRef.current;
      const chosen = current.find(
        (item) => item.kind === owner.kind && item.id === owner.id,
      );
      const nextIcon = next.icon ?? chosen?.icon ?? defaultIcon(owner);
      const nextColor =
        next.color === undefined ? (chosen?.color ?? null) : next.color;
      const nextGlyph =
        catalog.find((entry) => entry.name === nextIcon)?.glyph ??
        chosen?.glyph ??
        defaultGlyph(owner, defaults) ??
        [];
      const updated = [
        ...current.filter(
          (item) => !(item.kind === owner.kind && item.id === owner.id),
        ),
        { ...owner, icon: nextIcon, color: nextColor, glyph: nextGlyph },
      ];
      pendingRef.current = updated;
      setIcons(updated);
      announceIconsChanged();
      void rpc
        .call("setIcon", { ...owner, icon: nextIcon, color: nextColor })
        .catch(() => void refresh());
    },
    [catalog, defaults, refresh, rpc],
  );

  const reset = useCallback(
    (owner: IconOwner) => {
      const remaining = pendingRef.current.filter(
        (item) => !(item.kind === owner.kind && item.id === owner.id),
      );
      pendingRef.current = remaining;
      setIcons(remaining);
      announceIconsChanged();
      void rpc.call("clearIcon", owner).catch(() => void refresh());
    },
    [refresh, rpc],
  );

  const shared = {
    icons,
    defaults,
    catalog,
    loadingCatalog,
    onWanted: () => setWanted(true),
    onApply: apply,
    onReset: reset,
  };

  if (!showInHeader) return <span ref={markerRef} className="hidden" />;

  return (
    <>
      <span ref={markerRef} className="hidden" />
      {anchors.map((anchor) =>
        createPortal(
          <HeaderIcon
            owner={anchor.owner}
            ownerName={nameOf(anchor.owner)}
            {...shared}
          />,
          anchor.element,
          `${anchor.owner.kind}:${anchor.owner.id}`,
        ),
      )}
      {target === null || !lone
        ? null
        : createPortal(
            <HeaderIcon
              owner={loneOwner}
              ownerName={nameOf(loneOwner)}
              {...shared}
            />,
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
      // Published first and independently of any placement: a consumer that
      // marks its own box needs nothing else from this plugin, and nothing
      // here needs to know that consumer exists.
      const stopStylesheet = publishIconStylesheet({
        load: () => rpc.list(),
        subscribe: subscribeToIconChanges,
      });
      let teardown: (() => void) | null = null;
      let disposed = false;

      const dispose = () => {
        disposed = true;
        stopStylesheet();
        const stop = teardown;
        teardown = null;
        stop?.();
      };
      // Registered before anything can be placed, so an abort that arrives
      // mid-read is seen by the read rather than lost.
      signal.addEventListener("abort", dispose, { once: true });

      const place = (placements: readonly Placement[], drawSidebar: boolean) => {
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
            root.render(
              <Icons anchors={pending} placements={placements} rpc={rpc} />,
            );
          });
        };
        draw([]);
        const stop = drawSidebar ? observeSidebarIconAnchors(draw) : undefined;

        teardown = () => {
          cancel?.();
          // React owns nodes inside bb's sidebar, so it unmounts before the
          // anchors holding them are taken back out.
          root.unmount();
          stop?.();
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
        const drawSidebar = placements?.showInSidebar !== false;
        // Everything drawn over bb's own icons, minus whatever the reader
        // turned off. Nothing left on means nothing to mount at all.
        const enabled = PLACEMENTS.filter(
          (placement) => placements?.[placement.setting] !== false,
        );
        if (!drawSidebar && enabled.length === 0) return;
        place(enabled, drawSidebar);
      });

      return dispose;
    },
  });
});
