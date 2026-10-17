import { createElement, type ReactElement } from "react";
import type { IconDataV1 } from "../contracts";

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

export function renderProviderIcon(icon: IconDataV1): ReactElement {
  return renderNode(icon, "icon");
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
      {renderProviderIcon(icon)}
    </span>
  );
}
