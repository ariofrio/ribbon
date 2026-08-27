import { createElement, type ReactElement } from "react";
import type { IconDataV1 } from "./contracts";

function renderNode(node: IconDataV1, key: string): ReactElement {
  return createElement(
    node.tag,
    { ...node.attrs, key },
    node.children?.map((child, index) => renderNode(child, `${key}-${index}`)),
  );
}

export function ProviderIcon({
  icon,
  label,
}: {
  icon: IconDataV1;
  label: string;
}) {
  return (
    <span
      aria-label={label}
      className="inline-flex size-4 shrink-0 items-center justify-center [&_svg]:size-4"
    >
      {renderNode(icon, "icon")}
    </span>
  );
}
