import {
  experimental_THREAD_ACTION_GROUPS,
  experimental_useThreadActions,
  experimental_useThreadActionRegistrations,
  type PluginThreadActionEntry,
  type PluginThreadActionRegistrationInfo,
  type PluginThreadActionsOptions,
} from "@get-bb/plugin-sdk/app";
import type { SidebarThread } from "../../app/model/sidebar-thread.js";
import { toThreadActionTarget } from "../../app/rows/threadActionTarget.js";
import { useThreadSectionMove } from "../../app/rows/ThreadSectionMoveProvider.js";

export const RIBBON_MOVE_ACTION_KEY = "thread-stages/move";
const NATIVE_MOVE_ACTION_KEY = "thread-list/move";
const moveInfo: PluginThreadActionRegistrationInfo = {
  key: RIBBON_MOVE_ACTION_KEY,
  pluginId: "thread-stages",
  title: "Move to section",
  icon: "SectionMove",
};

export function useRibbonThreadActionRegistrations() {
  const registrations = experimental_useThreadActionRegistrations();
  const nativeIndex = registrations.findIndex(item => item.key === NATIVE_MOVE_ACTION_KEY);
  const result = registrations.filter(item => item.key !== NATIVE_MOVE_ACTION_KEY);
  result.splice(nativeIndex === -1 ? result.length : nativeIndex, 0, moveInfo);
  return result;
}

export function useRibbonThreadActions(thread: SidebarThread, options?: PluginThreadActionsOptions) {
  const registered = experimental_useThreadActions(toThreadActionTarget(thread), {
    requestRename: options?.requestRename,
  });
  const sectionMove = useThreadSectionMove();
  const entries = registered.filter(entry => entry.key !== NATIVE_MOVE_ACTION_KEY);
  if (sectionMove && thread.parentThreadId === null && thread.archivedAt === null) {
    const isCurrent = (sectionId: string | null) => thread.pinnedAt === null && thread.sectionId === sectionId;
    if (sectionMove.destinations.some(item => !isCurrent(item.sectionId))) {
      const move: PluginThreadActionEntry = {
        key: RIBBON_MOVE_ACTION_KEY,
        pluginId: "thread-stages",
        group: experimental_THREAD_ACTION_GROUPS.organize,
        action: {
          label: "Move to section",
          icon: "SectionMove",
          choices: {
            items: sectionMove.destinations.map(item => ({
              id: item.sectionId ?? "threads", label: item.label,
              selected: isCurrent(item.sectionId), disabled: isCurrent(item.sectionId),
            })),
          },
          run: async value => {
            const destination = sectionMove.destinations.find(item => (item.sectionId ?? "threads") === value);
            if (destination && !isCurrent(destination.sectionId)) sectionMove.moveThread(thread, destination.sectionId);
          },
        },
      };
      const renameIndex = entries.findIndex(entry => entry.key === "bb--core/rename");
      entries.splice(renameIndex === -1 ? entries.length : renameIndex, 0, move);
    }
  }
  return options?.keys === undefined ? entries : options.keys.flatMap(key => {
    const entry = entries.find(item => item.key === key);
    return entry ? [entry] : [];
  });
}
