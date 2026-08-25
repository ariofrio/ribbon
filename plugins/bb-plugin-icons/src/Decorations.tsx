import { createPortal } from "react-dom";
import type { Decoration } from "./decorate";
import { IconControl } from "./IconControl";
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
 * Puts the picker behind the icon, wherever a click there is free to open it.
 *
 * Only those spots reach React at all. Most of what this plugin draws over sits
 * inside a control bb already gave a job — a menu row that picks a project, a
 * pill that opens one — and an icon there is only to be looked at, so `paint`
 * gives it a marked box and the stylesheet fills it in. Where bb claimed
 * nothing, the icon has to answer a click, and answering one is what still
 * wants a component.
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
      {decorations
        .filter(({ picker }) => picker)
        .map(({ key, owner, target, glyphClassName }) =>
          createPortal(
            <IconControl
              owner={owner}
              name={controller.projects.nameOf(owner.id) ?? "this project"}
              controller={controller}
              glyphClassName={glyphClassName}
              triggerClassName={TRIGGER}
            />,
            target,
            key,
          ),
        )}
    </>
  );
}
