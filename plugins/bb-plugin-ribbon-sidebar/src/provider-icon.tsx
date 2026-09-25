import { createElement, type ReactElement } from "react";
import { CHROME_TITLE_COLOR_CLASS } from "./chrome-style-tokens";
import type { IconDataV1 } from "./contracts";

function renderNode(
  node: IconDataV1,
  key: string,
  className?: string,
): ReactElement {
  return createElement(
    node.tag,
    { ...node.attrs, key, ...(className ? { className } : {}) },
    node.children?.map((child, index) => renderNode(child, `${key}-${index}`)),
  );
}

export function ProviderIcon({
  icon,
  label,
  className = "",
}: {
  icon: IconDataV1;
  label: string;
  className?: string;
}) {
  return (
    <span
      aria-label={label}
      className={`inline-flex size-4 shrink-0 items-center justify-center [&_svg]:size-4 ${className}`}
    >
      {renderNode(icon, "icon")}
    </span>
  );
}

/**
 * A stage icon for a working thread. Its arc, in the title's color, turns with
 * the gap that closes the ring in the icon's own color. The stage's marks, like
 * Blocked's slash, stay upright on top.
 */
export function WorkingStageIcon({
  gap,
  arc,
  marks,
  label,
  className = "",
}: {
  gap: IconDataV1;
  arc: IconDataV1;
  marks: IconDataV1;
  label: string;
  className?: string;
}) {
  return (
    <span
      aria-label={label}
      className={`relative inline-flex size-4 shrink-0 [&_svg]:absolute [&_svg]:inset-0 [&_svg]:size-4 ${className}`}
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        className="motion-safe:animate-spin"
      >
        {renderNode(gap, "gap")}
        <g className={CHROME_TITLE_COLOR_CLASS} data-ribbon-working-arc="">
          {renderNode(arc, "arc")}
        </g>
      </svg>
      {marks.children?.length ? renderNode(marks, "marks") : null}
    </span>
  );
}
