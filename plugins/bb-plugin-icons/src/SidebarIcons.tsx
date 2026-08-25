import { createPortal } from "react-dom";
import { IconControl } from "./IconControl";
import type { SidebarAnchor } from "./sidebar-dom";
import type { IconsController } from "./use-icons";

function SidebarIcon({
  anchor,
  controller,
}: {
  anchor: SidebarAnchor;
  controller: IconsController;
}) {
  return (
    <IconControl
      owner={anchor.owner}
      name={anchor.name}
      controller={controller}
      readOnlyClassName="inline-flex size-4 items-center justify-center"
      triggerClassName="relative z-20 inline-flex size-4 shrink-0 cursor-pointer items-center justify-center rounded-sm transition-colors duration-150 hover:duration-0 hover:text-foreground"
      triggerProps={{
        // bb's group header is a drag handle and a collapse target, so the
        // control keeps the event from reaching either. It stops propagation
        // only: the picker's own trigger listens on this same button, and
        // Radix skips its handler once the event is default-prevented, so
        // preventing the default here would silently stop the picker from
        // ever opening.
        onPointerDown: (event) => event.stopPropagation(),
        onClick: (event) => event.stopPropagation(),
        onDragStart: (event) => event.preventDefault(),
      }}
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
