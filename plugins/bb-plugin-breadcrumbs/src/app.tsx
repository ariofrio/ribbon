import {
  definePluginApp,
  experimental_useSidebarThreadActions,
  useRpc,
  useSettings,
  type PluginThreadHeaderActionProps,
  useBbNavigate,
} from "@get-bb/plugin-sdk/app";
import { Icon } from "@/vendor/components/ui/icon";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { ProjectBreadcrumb } from "./ProjectBreadcrumb";
import { SectionBreadcrumb } from "./SectionBreadcrumb";
import {
  installBreadcrumbPortal,
  navigateToProjectSettings,
} from "./header-dom";
import { createCrumbRoot, type CrumbRoot } from "./crumb-root";
import type { rpcContract } from "./server";

interface Trail {
  section: { id: string; name: string } | null;
  project: { id: string; name: string; isPersonal: boolean } | null;
  ancestors: Array<{ id: string; title: string }>;
}

function BreadcrumbsBridge({ threadId }: PluginThreadHeaderActionProps) {
  const threadActions = experimental_useSidebarThreadActions();
  const rpc = useRpc<typeof rpcContract>();
  const settings = useSettings();
  const navigate = useBbNavigate();
  const markerRef = useRef<HTMLSpanElement>(null);
  const [portalTarget, setPortalTarget] = useState<HTMLElement | null>(null);
  const [trail, setTrail] = useState<Trail | null>(null);

  const showSection = settings.values?.showSection !== false;
  const showProject = settings.values?.showProject !== false;
  // Off until asked for, so an unread setting draws no crumb rather than one
  // that vanishes a moment later.
  const showAncestors = settings.values?.showAncestors === true;

  const refresh = useCallback(async () => {
    const next = await rpc
      .call("trailForThread", { threadId })
      .catch(() => null);
    if (next !== null) setTrail(next);
  }, [rpc, threadId]);

  /**
   * bb publishes no event a plugin can hear for a section, a rename, or a
   * move, so the trail is asked for again wherever it could have gone stale:
   * on mount, when the window is looked at again, and before a menu shows a
   * name. It is one call, and every crumb settles together.
   */
  useEffect(() => {
    void refresh();
    const onFocus = () => void refresh();
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
    };
  }, [refresh]);

  const section = showSection ? (trail?.section ?? null) : null;
  const project =
    showProject && trail?.project?.isPersonal === false ? trail.project : null;
  const ancestors = showAncestors ? (trail?.ancestors ?? []) : [];
  const shouldShow =
    section !== null || project !== null || ancestors.length > 0;

  useLayoutEffect(() => {
    const marker = markerRef.current;
    if (!shouldShow || marker === null) {
      setPortalTarget(null);
      return;
    }

    const mounted = installBreadcrumbPortal(marker);
    if (mounted === null) return;
    setPortalTarget(mounted.target);
    return mounted.cleanup;
  }, [shouldShow]);

  /**
   * The crumbs render in a root of their own, which draws them on a frame of
   * its own and offers them again if bb refuses them.
   *
   * bb refuses a React-owned node under a container React does not own while a
   * plugin is attributed on its stack, and the crumbs' container is exactly
   * that. Whose commit carries them makes no difference — the refusal reads
   * bb's attribution depth, not the tree — but a root of their own is what
   * lets the crumbs be drawn on their own terms, see what became of the draw,
   * and mount again. Portaled from bb's own root they would be committed and
   * re-committed on bb's schedule, blocked without anyone noticing, and
   * reported against whichever plugin's render bb happened to be in.
   * `crumb-root.ts` has the rest.
   */
  const crumbRootRef = useRef<CrumbRoot | null>(null);
  useEffect(() => {
    if (portalTarget === null) return;
    const crumbRoot = createCrumbRoot(portalTarget);
    crumbRootRef.current = crumbRoot;
    return () => {
      crumbRootRef.current = null;
      crumbRoot.dispose();
    };
  }, [portalTarget]);

  /**
   * Handed over on every render rather than on a dependency list: `ancestors`
   * is a fresh array each time, so a list would fire anyway, and the root
   * coalesces repeats into the one frame it already has on its way. A list
   * would instead cancel that frame each render, and a burst of them would
   * leave the crumbs undrawn for as long as it lasted.
   */
  useEffect(() => {
    crumbRootRef.current?.render(
      <Crumbs
        section={section}
        project={project}
        ancestors={ancestors}
        refresh={refresh}
        rpc={rpc}
        navigate={navigate}
        threadActions={threadActions}
      />,
    );
  });

  return <span ref={markerRef} hidden />;
}

interface CrumbsProps {
  section: { id: string; name: string } | null;
  project: { id: string; name: string; isPersonal: boolean } | null;
  ancestors: Array<{ id: string; title: string }>;
  refresh: () => Promise<void>;
  rpc: ReturnType<typeof useRpc<typeof rpcContract>>;
  navigate: ReturnType<typeof useBbNavigate>;
  threadActions: ReturnType<typeof experimental_useSidebarThreadActions>;
}

/**
 * Where the Icons plugin draws this owner's icon.
 *
 * bb's SDK gives one plugin no way to render another's component, and these
 * icons belong between the crumbs, so this marks the spot and lets the
 * neighbour fill it. Unfilled it draws nothing and adds no flex gap.
 *
 * It must stay childless: React reconciles children it created, and the
 * neighbour's are not its own. Being a container React owns is also what lets
 * bb's foreign-DOM guard admit a fresh node while a plugin is attributed.
 */
function IconAnchor({
  kind,
  ownerId,
}: {
  kind: "section" | "project";
  ownerId: string;
}) {
  return (
    <span
      data-breadcrumb-icon-anchor={kind}
      data-breadcrumb-icon-owner={ownerId}
      className="contents"
    />
  );
}

function Crumbs({ section, project, ancestors, refresh, rpc, navigate, threadActions }: CrumbsProps) {
  return (
    <>
      {section === null ? null : (
        <IconAnchor kind="section" ownerId={section.id} />
      )}
      {section === null ? null : (
        <SectionBreadcrumb
          sectionName={section.name}
          onOpen={() => void refresh()}
          onRename={async (name) => {
            await rpc.call("renameSection", {
              sectionId: section.id,
              name,
            });
            await refresh();
          }}
          onRemove={async () => {
            await rpc.call("removeSection", { sectionId: section.id });
            await refresh();
          }}
        />
      )}
      {project === null ? null : (
        <IconAnchor kind="project" ownerId={project.id} />
      )}
      {project === null ? null : (
        <ProjectBreadcrumb
          projectName={project.name}
          onOpenSettings={() => {
            navigateToProjectSettings(window, project.id);
          }}
          onRename={async (name) => {
            await rpc.call("renameProject", {
              projectId: project.id,
              name,
            });
            await refresh();
          }}
          onRemove={async () => {
            await rpc.call("removeProject", { projectId: project.id });
            navigate.toCompose();
          }}
        />
      )}
      {ancestors.map((ancestor) => (
        <span key={ancestor.id} className="contents">
          <button
            type="button"
            onClick={() => threadActions.open(ancestor.id)}
            title={ancestor.title}
            className="relative z-50 -mx-2 inline-flex min-h-7 min-w-0 shrink-0 cursor-pointer items-center rounded-md px-2 text-muted-foreground transition-colors duration-150 hover:duration-0 hover:bg-state-hover hover:text-foreground data-[state=open]:bg-state-active data-[state=open]:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring [app-region:no-drag] [-webkit-app-region:no-drag]"
          >
            <span className="max-w-48 truncate">{ancestor.title}</span>
          </button>
          <Icon
            name="ChevronRight"
            className="size-3.5 shrink-0 text-subtle-foreground"
            aria-hidden="true"
          />
        </span>
      ))}
    </>
  );
}

export default definePluginApp((app) => {
  app.slots.experimental_threadHeaderAction({
    id: "project-breadcrumb",
    title: "Breadcrumbs",
    component: BreadcrumbsBridge,
  });
});
