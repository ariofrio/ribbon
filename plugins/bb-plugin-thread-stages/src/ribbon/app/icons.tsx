import { useRpc } from "@get-bb/plugin-sdk/app";
import { createContext, useContext, useMemo, type ReactNode } from "react";
import { lightIconColor } from "../../icons/icon-colors";
import { iconFor, iconsRpc } from "../../icons/icons-client";
import type { iconsRpcContract } from "../../icons/server";
import { PERSONAL_PROJECT_ID, type IconOwner } from "../../icons/store";
import { useIcons, type IconsController } from "../../icons/use-icons";

const IconsContext = createContext<IconsController | null>(null);

/** One icons controller for every heading and row, fetched once. */
export function IconsProvider({ children }: { children: ReactNode }) {
  const rpc = useRpc<typeof iconsRpcContract>();
  const client = useMemo(() => iconsRpc(rpc), [rpc]);
  const controller = useIcons(client);
  return <IconsContext.Provider value={controller}>{children}</IconsContext.Provider>;
}

export function useIconsController(): IconsController | null {
  return useContext(IconsContext);
}

/**
 * The palette's light-mode anchor for an owner's chosen color, or null where
 * none was picked. Headings and action buttons derive their tints from it.
 */
export function useOwnerColor(owner: IconOwner | null): string | null {
  const controller = useIconsController();
  if (controller === null || owner === null) return null;
  return lightIconColor(iconFor(controller.state, owner, PERSONAL_PROJECT_ID).color);
}
