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
  /**
   * The unresolvable names this client has already gone back to the backend
   * about. Cleared whenever the list actually moves, so a name still unknown
   * after a fresh list is asked about once more, while a name that genuinely
   * belongs to no project — two projects sharing one — costs a single fetch
   * rather than one per pass.
   */
  const asked = useRef(new Set<string>());

  // Read through refs rather than dependencies: the project list arrives after
  // the first pass and moves again on every rename, and tearing the observer
  // down for that would pull every icon out and put it back.
  const projects = useRef(controller.projects);
  projects.current = controller.projects;
  const reload = useRef(controller.reload);
  reload.current = controller.reload;

  useEffect(() => {
    if (placements.length === 0) return;
    running.current = observeDecorations({
      placements,
      context: () => ({
        projects: projects.current,
        unresolved: (name) => {
          if (asked.current.has(name)) return;
          asked.current.add(name);
          reload.current();
        },
      }),
      onChange: setDecorations,
    });
    return () => {
      running.current?.stop();
      running.current = null;
    };
  }, [placements]);

  // Most of what bb draws a project on is found before the project list
  // arrives, and every one of those rows is recognized by name, so the first
  // pass over them finds nothing until this runs. A list that moved is also a
  // reason to ask again about the names it still does not answer.
  useEffect(() => {
    asked.current = new Set();
    running.current?.refresh();
  }, [controller.projects]);

  return (
    <>
      <SidebarIcons anchors={anchors} controller={controller} />
      <Decorations decorations={decorations} controller={controller} />
    </>
  );
}
