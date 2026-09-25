import { createElement, type ReactElement } from "react";
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
 * A stage icon for a working thread: the ring turns while the stage's own
 * marks, like Blocked's slash, stay upright on top of it.
 */
export function WorkingStageIcon({
  ring,
  marks,
  label,
  className = "",
}: {
  ring: IconDataV1;
  marks: IconDataV1;
  label: string;
  className?: string;
}) {
  return (
    <span
      aria-label={label}
      className={`relative inline-flex size-4 shrink-0 [&_svg]:absolute [&_svg]:inset-0 [&_svg]:size-4 ${className}`}
    >
      {renderNode(ring, "ring", "motion-safe:animate-spin")}
      {marks.children?.length ? renderNode(marks, "marks") : null}
    </span>
  );
}
