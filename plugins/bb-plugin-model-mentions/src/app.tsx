import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import {
  definePluginApp,
  experimental_ProviderIcon as ProviderIcon,
  experimental_useProviders as useProviders,
  useRpc,
  useRealtime,
  useRealtimeConnectionState,
  type PluginProvidersState,
} from "@get-bb/plugin-sdk/app";
import { PROVIDER_ICON_SLOTS, providerIconName } from "./icon-names";
import type { iconContract } from "./provider-icons";

type Provider = PluginProvidersState["providers"][number];
let directory = new Map<number, Provider>();
const listeners = new Set<() => void>();
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
const getDirectory = () => directory;
function publish(next: Map<number, Provider>) {
  directory = next;
  listeners.forEach((listener) => listener());
}

// Shared app icons render outside plugin slots, so SDK hooks run in this
// app-wide slot and icons read its per-window snapshot through React.
function ProviderDirectory() {
  const rpc = useRpc<typeof iconContract>();
  const { providers } = useProviders();
  const connection = useRealtimeConnectionState();
  const [ids, setIds] = useState<string[]>([]);
  const request = useRef(0);
  const refresh = useCallback(() => {
    const version = ++request.current;
    void rpc
      .call("icons.directory", null)
      .then((next) => {
        if (version === request.current) setIds(next);
      })
      .catch(() => undefined);
  }, [rpc]);
  useRealtime("provider-icons", refresh);
  useEffect(() => {
    refresh();
    return () => {
      request.current += 1;
    };
  }, [refresh, connection]);
  useEffect(() => {
    publish(
      new Map(
        ids.flatMap((id, slot) => {
          const provider = providers.find((p) => p.id === id);
          return provider ? [[slot, provider] as const] : [];
        }),
      ),
    );
  }, [ids, providers]);
  useEffect(() => () => publish(new Map()), []);
  return null;
}

function MentionProviderIcon({
  slot,
  className,
}: {
  slot: number;
  className?: string;
}) {
  const provider = useSyncExternalStore(
    subscribe,
    getDirectory,
    getDirectory,
  ).get(slot);
  return (
    <ProviderIcon
      providerKind="agent"
      provider={provider ?? { id: "" }}
      className={className}
      aria-hidden
    />
  );
}

export default definePluginApp((app) => {
  app.slots.experimental_appOverlay({
    id: "provider-directory",
    component: ProviderDirectory,
  });
  for (let slot = 0; slot < PROVIDER_ICON_SLOTS; slot += 1) {
    app.experimental_icons.register({
      name: providerIconName(slot),
      component: ({ className }) => (
        <MentionProviderIcon slot={slot} className={className} />
      ),
    });
  }
});
