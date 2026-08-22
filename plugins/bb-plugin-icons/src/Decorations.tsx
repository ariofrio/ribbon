import { createPortal } from "react-dom";
import type { Decoration } from "./decorate";
import { IconGlyph } from "./IconGlyph";
import { iconFor, type IconsState } from "./icons-client";
import { PERSONAL_PROJECT_ID } from "./store";

/**
 * Draws the icon in every place this plugin stands in for one of bb's own.
 *
 * These are read-only: each one sits inside a control bb already gave a job —
 * a menu row that picks a project, a pill that opens one — so the icon shows
 * the project and leaves the clicking to bb. Only the sidebar and the thread
 * header carry the picker.
 */
export function Decorations({
  decorations,
  state,
}: {
  decorations: readonly Decoration[];
  state: IconsState | null;
}) {
  return (
    <>
      {decorations.map(({ key, owner, target, glyphClassName }) =>
        createPortal(
          <IconGlyph
            icon={iconFor(state, owner, PERSONAL_PROJECT_ID)}
            className={glyphClassName}
          />,
          target,
          key,
        ),
      )}
    </>
  );
}
