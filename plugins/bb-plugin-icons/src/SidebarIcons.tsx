import { HugeiconsIcon } from "@hugeicons/react";
import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { announceIconsChanged, ICONS_CHANNEL } from "./broadcast";
import { iconColorStyle } from "./icon-colors";
import {
  iconFor,
  type CatalogEntryView,
  type IconsRpc,
  type IconsState,
} from "./icons-client";
import { IconPicker } from "./IconPicker";
import type { SidebarAnchor } from "./sidebar-dom";
import {
  PERSONAL_PROJECT_ID,
  defaultIcon,
  isEditable,
  type IconColor,
  type IconOwner,
} from "./store";

interface SidebarIconProps {
  anchor: SidebarAnchor;
  state: IconsState | null;
  catalog: readonly CatalogEntryView[];
  loadingCatalog: boolean;
  onOpenPicker(): void;
  onApply(owner: IconOwner, next: { icon?: string; color?: IconColor | null }): void;
  onReset(owner: IconOwner): void;
}

function SidebarIcon({
  anchor,
  state,
  catalog,
  loadingCatalog,
  onOpenPicker,
  onApply,
  onReset,
}: SidebarIconProps) {
  const [picking, setPicking] = useState(false);
  const { owner, name } = anchor;
  const { name: iconName, glyph, color } = iconFor(state, owner, PERSONAL_PROJECT_ID);
  const editable = isEditable(owner);
  // A row holding the default glyph is still a choice, and still removable.
  const stored =
    state?.icons.some(
      (item) => item.kind === owner.kind && item.id === owner.id,
    ) ?? false;

  const glyphNode =
    glyph === undefined ? null : (
      <HugeiconsIcon
        icon={glyph}
        className="size-4 shrink-0"
        style={iconColorStyle(color)}
        data-icon={iconName}
        aria-hidden
      />
    );

  if (!editable) {
    return (
      <span className="inline-flex size-4 items-center justify-center">
        {glyphNode}
      </span>
    );
  }

  const trigger = (
    <button
      type="button"
      aria-label={`Icon for ${name}`}
      title="Change icon"
      // Fetched on approach, so the picker is whole when it opens rather than
      // arriving and then filling in. loadCatalog only ever runs once.
      onPointerEnter={onOpenPicker}
      onFocus={onOpenPicker}
      // bb's group header is a drag handle and a collapse target, so the
      // control keeps the event from reaching either. It stops propagation
      // only: the picker's own trigger listens on this same button, and Radix
      // skips its handler once the event is default-prevented, so preventing
      // the default here would silently stop the picker from ever opening.
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
      onDragStart={(event) => event.preventDefault()}
      // No color of its own: bb pairs an icon with the label beside it, and
      // that label's color is the one thing that moves with the theme. Pinning
      // a token here made the icon brighter than its label in one theme and
      // darker in another, since the token stayed put while the label did not.
      className="relative z-20 inline-flex size-4 shrink-0 cursor-pointer items-center justify-center rounded-sm transition-colors duration-150 hover:duration-0 hover:text-foreground"
    >
      {glyphNode}
    </button>
  );

  return (
    <IconPicker
      catalog={catalog}
      loading={loadingCatalog}
      open={picking}
      onOpenChange={(next) => {
        setPicking(next);
        if (next) onOpenPicker();
      }}
      ownerName={name}
      icon={iconName}
      defaultIcon={defaultIcon(owner)}
      stored={stored}
      color={color}
      onPick={(next) => onApply(owner, { icon: next })}
      onPickColor={(next) => onApply(owner, { color: next })}
      onReset={() => onReset(owner)}
      trigger={trigger}
    />
  );
}

/**
 * Draws this plugin's icon into every bb sidebar group header it is given.
 *
 * One React tree portals into all of them rather than a root per header, so a
 * sidebar that swaps every group at once — which bb does when the organize
 * mode changes — costs one render instead of a mount per row.
 */
export function SidebarIcons({
  anchors,
  rpc,
}: {
  anchors: readonly SidebarAnchor[];
  rpc: IconsRpc;
}) {
  const [state, setState] = useState<IconsState | null>(null);
  const [catalog, setCatalog] = useState<readonly CatalogEntryView[]>([]);
  const [loadingCatalog, setLoadingCatalog] = useState(false);
  const refresh = useCallback(async () => {
    const next = await rpc.list();
    if (next !== null) setState(next);
  }, [rpc]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // The thread header and other windows announce their edits here, and bb
  // publishes nothing about sections, so a focus check covers the rest.
  useEffect(() => {
    let channel: BroadcastChannel | null = null;
    try {
      channel = new BroadcastChannel(ICONS_CHANNEL);
      channel.onmessage = () => void refresh();
    } catch {
      // Clients without BroadcastChannel still refresh on focus.
    }
    const onFocus = () => void refresh();
    window.addEventListener("focus", onFocus);
    return () => {
      channel?.close();
      window.removeEventListener("focus", onFocus);
    };
  }, [refresh]);

  const loadCatalog = useCallback(() => {
    if (catalog.length > 0 || loadingCatalog) return;
    setLoadingCatalog(true);
    void rpc
      .listCatalog()
      .then((next) => {
        if (next !== null) setCatalog(next.icons);
      })
      .finally(() => setLoadingCatalog(false));
  }, [catalog.length, loadingCatalog, rpc]);

  const apply = useCallback(
    (owner: IconOwner, next: { icon?: string; color?: IconColor | null }) => {
      const current = iconFor(state, owner, PERSONAL_PROJECT_ID);
      const icon = next.icon ?? current.name;
      const color = next.color === undefined ? current.color : next.color;
      const glyph =
        catalog.find((entry) => entry.name === icon)?.glyph ?? current.glyph ?? [];
      setState((previous) =>
        previous === null
          ? previous
          : {
              ...previous,
              icons: [
                ...previous.icons.filter(
                  (item) => !(item.kind === owner.kind && item.id === owner.id),
                ),
                { ...owner, icon, color, glyph },
              ],
            },
      );
      announceIconsChanged();
      void rpc.set({ ...owner, icon, color }).then((result) => {
        if (result === null) void refresh();
      });
    },
    [catalog, refresh, rpc, state],
  );

  const reset = useCallback(
    (owner: IconOwner) => {
      setState((previous) =>
        previous === null
          ? previous
          : {
              ...previous,
              icons: previous.icons.filter(
                (item) => !(item.kind === owner.kind && item.id === owner.id),
              ),
            },
      );
      announceIconsChanged();
      void rpc.clear(owner).then((result) => {
        if (result === null) void refresh();
      });
    },
    [refresh, rpc],
  );

  return (
    <>
      {anchors.map((anchor) =>
        createPortal(
          <SidebarIcon
            anchor={anchor}
            state={state}
            catalog={catalog}
            loadingCatalog={loadingCatalog}
            onOpenPicker={loadCatalog}
            onApply={apply}
            onReset={reset}
          />,
          anchor.target,
          `${anchor.owner.kind}:${anchor.owner.id}`,
        ),
      )}
    </>
  );
}
