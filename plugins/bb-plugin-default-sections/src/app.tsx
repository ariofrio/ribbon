import { definePluginApp, useRealtime, useRpc } from "@get-bb/plugin-sdk/app";
import { useCallback, useEffect, useState } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/vendor/components/ui/select";
import type { DefaultSection, defaultSectionsRpcContract } from "./server";

/**
 * Thread stages listens here for edits made in this window or another, since
 * a plugin cannot join another plugin's realtime channel.
 */
const DEFAULT_SECTIONS_CHANNEL = "bb.default-sections";

/** Radix reserves the empty string, so no section needs a value of its own. */
const THREADS = "threads";

interface Settings {
  defaults: DefaultSection[];
  projects: Array<{ id: string; name: string }>;
  sections: Array<{ id: string; name: string }>;
}

function announce() {
  try {
    const channel = new BroadcastChannel(DEFAULT_SECTIONS_CHANNEL);
    channel.postMessage({ type: "defaults-changed" });
    channel.close();
  } catch {
    // Listeners without BroadcastChannel catch up when their menus open.
  }
}

function DefaultSectionSettings() {
  const rpc = useRpc<typeof defaultSectionsRpcContract>();
  const [settings, setSettings] = useState<Settings>();
  const [error, setError] = useState<string>();

  const refresh = useCallback(() => {
    rpc.call("readSettings", null).then(setSettings, (reason: unknown) =>
      setError(String(reason)),
    );
  }, [rpc]);
  useEffect(refresh, [refresh]);
  useRealtime("defaults-changed", refresh);

  async function save(projectId: string, sectionId: string | null) {
    if (!settings) return;
    const previous = settings;
    setSettings({
      ...settings,
      defaults: [
        ...settings.defaults.filter((entry) => entry.projectId !== projectId),
        ...(sectionId === null ? [] : [{ projectId, sectionId }]),
      ],
    });
    setError(undefined);
    try {
      await rpc.call("setDefaultV1", { projectId, sectionId });
      announce();
    } catch (reason) {
      setSettings(previous);
      setError(String(reason));
    }
  }

  if (!settings)
    return error ? <p className="text-sm text-destructive">{error}</p> : null;
  // Match the card and rows bb draws for declared settings above this section.
  return (
    <div className="overflow-hidden rounded-md border border-border bg-surface-recessed/70">
      <div className="px-3 py-3">
        <p className="text-sm font-normal text-foreground">Default sections</p>
        <p className="mt-0.5 text-xs leading-snug text-subtle-foreground/75">
          {settings.sections.length === 0
            ? "No sections yet. Create one in the sidebar, then choose where each project's new threads start."
            : "A project's new threads start in its default section, unless you start one in a section or fork one. Threads already in the sidebar stay where they are."}
        </p>
        {error && (
          <p className="mt-1 text-xs leading-snug text-destructive">{error}</p>
        )}
      </div>
      {settings.sections.length > 0 &&
        settings.projects.map((project) => {
          const current =
            settings.defaults.find((entry) => entry.projectId === project.id)
              ?.sectionId ?? THREADS;
          return (
            <div
              key={project.id}
              className="flex items-center justify-between gap-5 border-t border-border px-3 py-2"
            >
              <p className="min-w-0 truncate text-sm text-foreground">
                {project.name}
              </p>
              <Select
                value={current}
                onValueChange={(value) =>
                  void save(project.id, value === THREADS ? null : value)
                }
              >
                <SelectTrigger
                  aria-label={`${project.name}'s default section`}
                  className="w-48 shrink-0"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent align="end">
                  <SelectItem value={THREADS}>Threads</SelectItem>
                  <SelectSeparator />
                  {settings.sections.map((section) => (
                    <SelectItem key={section.id} value={section.id}>
                      {section.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          );
        })}
    </div>
  );
}

export default definePluginApp((app) => {
  app.slots.settingsSection({
    id: "default-sections",
    component: DefaultSectionSettings,
  });
});
