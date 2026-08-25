import type { PluginContentScriptContext } from "@get-bb/plugin-sdk/app";
import { Icon } from "@/vendor/components/ui/icon";
import {
  hideThreadComposerProject,
  installNewThreadBreadcrumbs,
  readComposeSectionId,
  selectComposeSection,
  type NewThreadBreadcrumbMount,
} from "./composer-dom";
import { createCrumbRoot, type CrumbRoot } from "./crumb-root";
import { SectionPicker } from "./SectionPicker";

interface ComposerSettings {
  showComposerBreadcrumbs: boolean;
}

interface SectionsResult {
  sections: Array<{ id: string; name: string }>;
}

async function callRpc<Result>(
  pluginId: string,
  method: string,
  input: unknown,
  signal: AbortSignal,
): Promise<Result> {
  const response = await fetch(
    `/api/v1/plugins/${encodeURIComponent(pluginId)}/rpc/${method}`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
      signal,
    },
  );
  const payload = (await response.json()) as
    | { ok: true; result: Result }
    | { ok: false; error?: { message?: string } };
  if (!response.ok || !payload.ok) {
    const message = !payload.ok ? payload.error?.message : undefined;
    throw new Error(message ?? `Breadcrumbs RPC ${method} failed`);
  }
  return payload.result;
}

interface InstalledNewThreadLayout {
  dom: NewThreadBreadcrumbMount;
  sectionRoot: CrumbRoot;
  separatorRoot: CrumbRoot;
  selectedSectionId: string | null;
}

class ComposerLayoutController {
  private enabled = false;
  private sections: SectionsResult["sections"] = [];
  private sectionsLoading = true;
  private sectionsLoaded = false;
  private disposed = false;
  private reconcileQueued = false;
  private readonly knownComposers = new WeakSet<HTMLElement>();
  private readonly initialSectionIds = new WeakMap<HTMLElement, string | null>();
  private readonly newThreadLayouts = new Map<
    HTMLElement,
    InstalledNewThreadLayout
  >();
  private readonly threadProjectCleanups = new Map<HTMLElement, () => void>();
  private readonly observer = new MutationObserver(() => this.queueReconcile());

  constructor(
    private readonly pluginId: string,
    private readonly signal: AbortSignal,
  ) {}

  async start(): Promise<void> {
    this.observer.observe(document.body, { childList: true, subtree: true });
    this.captureInitialSections();
    window.addEventListener("focus", this.handleFocus);
    document.addEventListener("visibilitychange", this.handleVisibilityChange);
    this.signal.addEventListener("abort", this.dispose, { once: true });
    await Promise.allSettled([this.refreshSettings(), this.refreshSections()]);
    if (!this.disposed) this.reconcile();
  }

  readonly dispose = () => {
    if (this.disposed) return;
    this.disposed = true;
    this.observer.disconnect();
    window.removeEventListener("focus", this.handleFocus);
    document.removeEventListener(
      "visibilitychange",
      this.handleVisibilityChange,
    );
    this.signal.removeEventListener("abort", this.dispose);
    this.clearLayouts();
  };

  private readonly handleFocus = () => {
    void this.refreshAll();
  };

  private readonly handleVisibilityChange = () => {
    if (document.visibilityState === "visible") void this.refreshAll();
  };

  private async refreshAll(): Promise<void> {
    await Promise.allSettled([this.refreshSettings(), this.refreshSections()]);
    if (!this.disposed) this.reconcile();
  }

  private async refreshSettings(): Promise<void> {
    const settings = await callRpc<ComposerSettings>(
      this.pluginId,
      "listCrumbs",
      null,
      this.signal,
    );
    this.enabled = settings.showComposerBreadcrumbs;
  }

  private async refreshSections(): Promise<void> {
    if (!this.sectionsLoaded) {
      this.sectionsLoading = true;
      this.renderNewThreadLayouts();
    }
    try {
      const result = await callRpc<SectionsResult>(
        this.pluginId,
        "listSections",
        null,
        this.signal,
      );
      this.sections = result.sections;
    } finally {
      this.sectionsLoaded = true;
      this.sectionsLoading = false;
      this.renderNewThreadLayouts();
    }
  }

  private queueReconcile(): void {
    const discoveredComposer = this.captureInitialSections();
    if (this.reconcileQueued || this.disposed) return;
    this.reconcileQueued = true;
    queueMicrotask(() => {
      this.reconcileQueued = false;
      if (this.disposed) return;
      if (discoveredComposer) {
        void this.refreshSettings()
          .then(() => {
            if (!this.disposed) this.reconcile();
          })
          .catch(() => {});
      } else this.reconcile();
    });
  }

  private captureInitialSections(): boolean {
    let discoveredComposer = false;
    for (const composer of Array.from(
      document.querySelectorAll<HTMLElement>(
        '[data-app-composer][data-app-composer-role="primary"]',
      ),
    )) {
      if (!this.knownComposers.has(composer)) {
        this.knownComposers.add(composer);
        discoveredComposer = true;
      }
      if (
        composer.querySelector("[data-promptbox-project-control]") !== null &&
        !this.initialSectionIds.has(composer)
      ) {
        this.initialSectionIds.set(composer, readComposeSectionId(window));
      }
    }
    return discoveredComposer;
  }

  private reconcile(): void {
    const composers = new Set<HTMLElement>(
      Array.from(
        document.querySelectorAll<HTMLElement>(
        '[data-app-composer][data-app-composer-role="primary"]',
        ),
      ),
    );
    for (const [composer, layout] of this.newThreadLayouts) {
      if (
        !this.enabled ||
        !composers.has(composer) ||
        !layout.dom.root.isConnected
      ) {
        this.disposeNewThreadLayout(composer, layout);
      }
    }
    for (const [composer, cleanup] of this.threadProjectCleanups) {
      if (!this.enabled || !composers.has(composer)) {
        cleanup();
        this.threadProjectCleanups.delete(composer);
      }
    }
    if (!this.enabled) return;

    for (const composer of composers) {
      if (this.newThreadLayouts.has(composer)) continue;
      if (
        composer.querySelector("[data-promptbox-project-control]") !== null
      ) {
        this.installNewThreadLayout(composer);
      } else if (
        composer.querySelector("[data-follow-up-composer-footer]") !== null &&
        !this.threadProjectCleanups.has(composer)
      ) {
        this.threadProjectCleanups.set(
          composer,
          hideThreadComposerProject(composer),
        );
      }
    }
  }

  private installNewThreadLayout(composer: HTMLElement): void {
    const dom = installNewThreadBreadcrumbs(composer);
    if (dom === null) return;
    const layout: InstalledNewThreadLayout = {
      dom,
      sectionRoot: createCrumbRoot(dom.sectionTarget),
      separatorRoot: createCrumbRoot(dom.projectSeparatorTarget),
      selectedSectionId: this.initialSectionIds.get(composer) ?? null,
    };
    this.newThreadLayouts.set(composer, layout);
    this.renderNewThreadLayout(layout);
  }

  private renderNewThreadLayouts(): void {
    for (const layout of this.newThreadLayouts.values()) {
      this.renderNewThreadLayout(layout);
    }
  }

  private renderNewThreadLayout(layout: InstalledNewThreadLayout): void {
    layout.sectionRoot.render(
      <>
        <SectionPicker
          sections={this.sections}
          selectedSectionId={layout.selectedSectionId}
          isLoading={this.sectionsLoading}
          onOpen={() => {
            void this.refreshSections();
          }}
          onSelect={(sectionId) => {
            layout.selectedSectionId = sectionId;
            this.renderNewThreadLayout(layout);
            selectComposeSection(window, sectionId);
          }}
        />
        <Icon
          name="ChevronRight"
          className="size-3.5 shrink-0 text-subtle-foreground"
          aria-hidden="true"
        />
      </>,
    );
    layout.separatorRoot.render(
      <Icon
        name="ChevronRight"
        className="size-3.5 shrink-0 text-subtle-foreground"
        aria-hidden="true"
      />,
    );
  }

  private disposeNewThreadLayout(
    composer: HTMLElement,
    layout: InstalledNewThreadLayout,
  ): void {
    layout.sectionRoot.dispose();
    layout.separatorRoot.dispose();
    layout.dom.cleanup();
    this.newThreadLayouts.delete(composer);
  }

  private clearLayouts(): void {
    for (const [composer, layout] of [...this.newThreadLayouts]) {
      this.disposeNewThreadLayout(composer, layout);
    }
    for (const cleanup of this.threadProjectCleanups.values()) cleanup();
    this.threadProjectCleanups.clear();
  }
}

export async function mountComposerBreadcrumbs(
  context: PluginContentScriptContext,
): Promise<() => void> {
  const controller = new ComposerLayoutController(
    context.pluginId,
    context.signal,
  );
  await controller.start();
  return controller.dispose;
}
