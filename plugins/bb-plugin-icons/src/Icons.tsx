import type { IconsRpc } from "./icons-client";
import type { SidebarAnchor } from "./sidebar-dom";
import { SidebarIcons } from "./SidebarIcons";
import { useIcons } from "./use-icons";

/**
 * The content script's whole React tree.
 *
 * Everything it draws hangs off one controller, so the icons it puts in bb's
 * sidebar and the ones it puts over bb's own are fetched once and can never
 * show two different answers for the same project.
 */
export function Icons({
  anchors,
  rpc,
}: {
  anchors: readonly SidebarAnchor[];
  rpc: IconsRpc;
}) {
  const controller = useIcons(rpc);
  return <SidebarIcons anchors={anchors} controller={controller} />;
}
