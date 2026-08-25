import { createPortal } from "react-dom";
import type { Decoration } from "./decorate";
import { IconControl } from "./IconControl";
import { IconGlyph } from "./IconGlyph";
import { iconFor } from "./icons-client";
import type { IconsController } from "./use-icons";

/**
 * The hover a trigger takes where bb's own chips sit.
 *
 * bb lifts a clickable chip in that strip with `hover:bg-state-hover` on a
 * rounded corner, so the icon does the same. The negative margin is what keeps
 * it from moving anything: the button draws at 24px and lays out at 16, which
 * is the size of the glyph it stands in for, so the words beside it stay where
 * bb put them and only the lit area is larger than the icon.
 */
const TRIGGER =
  "-m-1 flex size-6 shrink-0 cursor-pointer items-center justify-center rounded-md transition-colors duration-150 hover:duration-0 hover:bg-state-hover hover:text-foreground";

/**
 * Draws the icon in every place this plugin stands in for one of bb's own.
 *
 * Most are read-only: they sit inside a control bb already gave a job — a menu
 * row that picks a project, a pill that opens one — so the icon shows the
 * project and leaves the clicking to bb. Where bb claimed nothing, the icon
 * opens the picker instead.
 */
export function Decorations({
  decorations,
  controller,
}: {
  decorations: readonly Decoration[];
  controller: IconsController;
}) {
  return (
    <>
      {decorations.map(({ key, owner, target, glyphClassName, picker }) =>
        createPortal(
          picker ? (
            <IconControl
              owner={owner}
              name={controller.projects.nameOf(owner.id) ?? "this project"}
              controller={controller}
              glyphClassName={glyphClassName}
              triggerClassName={TRIGGER}
            />
          ) : (
            <IconGlyph
              icon={iconFor(controller.state, owner)}
              className={glyphClassName}
            />
          ),
          target,
          key,
        ),
      )}
    </>
  );
}
