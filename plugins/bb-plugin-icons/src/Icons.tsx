import { useEffect, useRef, useState } from "react";
import {
  observeDecorations,
  type Decorating,
  type Decoration,
  type Placement,
} from "./decorate";
import { Decorations } from "./Decorations";
import type { IconsRpc } from "./icons-client";
import type { SidebarAnchor } from "./sidebar-dom";
import { SidebarIcons } from "./SidebarIcons";
import { useIcons } from "./use-icons";

/**
 * The content script's whole React tree.
 *
 * Everything it draws hangs off one controller, so the icons it puts on bb's
 * sidebar headers and the ones it puts over bb's own are fetched once and can
 * never show two different answers for the same project.
 */
export function Icons({
  anchors,
  placements,
  rpc,
}: {
  anchors: readonly SidebarAnchor[];
  placements: readonly Placement[];
  rpc: IconsRpc;
}) {
  const controller = useIcons(rpc);
  const [decorations, setDecorations] = useState<readonly Decoration[]>([]);
  const running = useRef<Decorating | null>(null);

  // Read through a ref rather than a dependency: the project list arrives
  // after the first pass and moves again on every rename, and tearing the
  // observer down for that would pull every icon out and put it back.
  const projects = useRef(controller.projects);
  projects.current = controller.projects;

  useEffect(() => {
    if (placements.length === 0) return;
    running.current = observeDecorations({
      placements,
      context: () => ({ projects: projects.current }),
      onChange: setDecorations,
    });
    return () => {
      running.current?.stop();
      running.current = null;
    };
  }, [placements]);

  // Most of what bb draws a project on is found before the project list
  // arrives, and every one of those rows is recognized by name, so the first
  // pass over them finds nothing until this runs.
  useEffect(() => {
    running.current?.refresh();
  }, [controller.projects]);

  return (
    <>
      <SidebarIcons anchors={anchors} controller={controller} />
      <Decorations decorations={decorations} state={controller.state} />
    </>
  );
}
