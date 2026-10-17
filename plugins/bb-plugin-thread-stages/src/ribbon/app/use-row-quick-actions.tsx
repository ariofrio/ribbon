import {
  memo,
  useCallback,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { PluginThreadActionEntry } from "@get-bb/plugin-sdk/app";
import type { SidebarThread } from "../../app/model/sidebar-thread.js";
import { useRibbonThreadActions } from "./row-actions.js";
const EMPTY: PluginThreadActionEntry[] = [];
const Registration = memo(function Registration({
  thread,
  keys,
  requestRename,
  publish,
}: {
  thread: SidebarThread;
  keys: string[];
  requestRename: () => void;
  publish: (entries: PluginThreadActionEntry[]) => void;
}) {
  const entries = useRibbonThreadActions(thread, { keys, requestRename });
  useLayoutEffect(() => publish(entries), [entries, publish]);
  return null;
});
/** An empty quick-action list needs neither action resolution nor its host subscriptions. */
export function useRowQuickActions(
  thread: SidebarThread,
  keys: readonly string[],
  requestRename: () => void,
) {
  const signature = keys.join("\0");
  const stableKeys = useMemo(
    () => (signature ? signature.split("\0") : []),
    [signature],
  );
  const renameRef = useRef(requestRename);
  renameRef.current = requestRename;
  const rename = useCallback(() => renameRef.current(), []);
  const [resolved, setResolved] = useState<{
    signature: string;
    threadId: string;
    entries: PluginThreadActionEntry[];
  } | null>(null);
  const publish = useCallback(
    (entries: PluginThreadActionEntry[]) =>
      setResolved({ signature, threadId: thread.id, entries }),
    [signature, thread.id],
  );
  return {
    entries:
      signature &&
      resolved?.signature === signature &&
      resolved.threadId === thread.id
        ? resolved.entries
        : EMPTY,
    registration: stableKeys.length ? (
      <Registration
        thread={thread}
        keys={stableKeys}
        requestRename={rename}
        publish={publish}
      />
    ) : null,
  };
}
