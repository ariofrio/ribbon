import { createPortal } from "react-dom";
import { useState } from "react";
import { IconGlyph } from "./IconGlyph";
import { iconFor } from "./icons-client";
import { IconPicker } from "./IconPicker";
import type { SidebarAnchor } from "./sidebar-dom";
import { PERSONAL_PROJECT_ID, defaultIcon, isEditable } from "./store";
import type { IconsController } from "./use-icons";

function SidebarIcon({
  anchor,
  controller,
}: {
  anchor: SidebarAnchor;
  controller: IconsController;
}) {
  const [picking, setPicking] = useState(false);
  const { owner, name } = anchor;
  const { state, catalog, loadingCatalog, loadCatalog, apply, reset } = controller;
  const drawn = iconFor(state, owner, PERSONAL_PROJECT_ID);
  const glyph = <IconGlyph icon={drawn} />;

  if (!isEditable(owner)) {
    return (
      <span className="inline-flex size-4 items-center justify-center">
        {glyph}
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
      onPointerEnter={loadCatalog}
      onFocus={loadCatalog}
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
      {glyph}
    </button>
  );

  return (
    <IconPicker
      catalog={catalog}
      loading={loadingCatalog}
      open={picking}
      onOpenChange={(next) => {
        setPicking(next);
        if (next) loadCatalog();
      }}
      ownerName={name}
      icon={drawn.name}
      defaultIcon={defaultIcon(owner)}
      color={drawn.color}
      onPick={(next) => apply(owner, { icon: next })}
      onPickColor={(next) => apply(owner, { color: next })}
      onReset={() => reset(owner)}
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
  controller,
}: {
  anchors: readonly SidebarAnchor[];
  controller: IconsController;
}) {
  return (
    <>
      {anchors.map((anchor) =>
        createPortal(
          <SidebarIcon anchor={anchor} controller={controller} />,
          anchor.target,
          `${anchor.owner.kind}:${anchor.owner.id}`,
        ),
      )}
    </>
  );
}
