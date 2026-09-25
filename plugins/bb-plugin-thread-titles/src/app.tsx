import {
  definePluginApp,
  experimental_ProviderModelPicker as ProviderModelPicker,
  experimental_useProviders,
  useRpc,
} from "@get-bb/plugin-sdk/app";
import { useEffect, useState } from "react";
import { Button } from "@/vendor/components/ui/button";
import type { rpcContract, Selection } from "./server";

function TitleModelSettings() {
  const rpc = useRpc<typeof rpcContract>();
  const providers = experimental_useProviders();
  const [state, setState] = useState<{
    selection: Selection | null;
    suggestion: Selection | null;
  }>();
  const [error, setError] = useState<string>();

  useEffect(() => {
    let live = true;
    rpc.call("selection.get", null).then(
      (next) => live && setState(next),
      (reason: unknown) => live && setError(String(reason)),
    );
    return () => {
      live = false;
    };
  }, [rpc]);

  async function save(selection: Selection | null) {
    const previous = state;
    setState((current) => current && { ...current, selection });
    setError(undefined);
    try {
      await rpc.call("selection.set", { selection });
    } catch (reason) {
      setState(previous);
      setError(String(reason));
    }
  }

  if (!state)
    return error ? <p className="text-sm text-destructive">{error}</p> : null;
  // Match the card and row bb draws for declared settings above this section.
  return (
    <div className="overflow-hidden rounded-md border border-border bg-surface-recessed/70 px-3 py-3">
      <div className="flex flex-col gap-2.5 sm:flex-row sm:items-start sm:justify-between sm:gap-5">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-normal text-foreground">Title model</p>
          <p className="mt-0.5 text-xs leading-snug text-subtle-foreground/75">
            {state.selection
              ? "Every thread uses this model on its own machine. A thread whose machine lacks it keeps its title."
              : "Automatic: Luna on Codex threads and Haiku on Claude Code threads. Threads on other providers keep their titles."}
          </p>
          {error && (
            <p className="mt-1 text-xs leading-snug text-destructive">{error}</p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2 sm:justify-end">
          {state.selection ? (
            <>
              <ProviderModelPicker
                value={state.selection}
                onChange={(selection) => void save(selection)}
                align="end"
              />
              <Button variant="ghost" size="sm" onClick={() => void save(null)}>
                Use automatic
              </Button>
            </>
          ) : (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                // Without a suggestion, the picker starts on a provider with no
                // model, and nothing is saved until the user picks one.
                const seed = state.suggestion ?? {
                  providerId: providers.providers[0]?.id ?? "codex",
                  model: "",
                  reasoningLevel: "low" as const,
                };
                if (state.suggestion) void save(seed);
                else setState({ ...state, selection: seed });
              }}
            >
              Choose a model
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

export default definePluginApp((app) => {
  app.slots.settingsSection({
    id: "title-model",
    component: TitleModelSettings,
  });
});
