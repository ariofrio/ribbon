import { useAtomValue } from "jotai";
import { useSettings } from "@get-bb/plugin-sdk/app";
import { Fragment, useMemo, type ReactNode } from "react";
import {
  projectThreadItemContainsThread,
  type ProjectThreadItem,
} from "../../app/model/project-thread-groups.js";
import { getSidebarItemKey } from "../../app/rows/sidebarItemKeys.js";
import { itemThread, stageBands } from "./bands";
import { ribbonStageLookupAtom } from "./atoms";
import { useRibbonList } from "./search";
import { StagePreview } from "./stage-preview";
import { stagePreviewRowsSetting } from "../stage-preview-rows";

/**
 * A group's roots in Ribbon's shape: the main list, then Deferred and
 * Completed as short previews that expand in place. The main list keeps the
 * windowed rendering bb gives every list; the previews keep the open thread
 * within their row budget when there is room for a thread.
 */
export function StageBandedItems({
  items,
  selectedThreadId,
  renderMain,
  renderItem,
  revealAll = false,
}: {
  items: readonly ProjectThreadItem[];
  selectedThreadId?: string;
  /** Renders the main band the way the list renders any run of items. */
  renderMain: (items: readonly ProjectThreadItem[]) => ReactNode;
  renderItem: (item: ProjectThreadItem) => ReactNode;
  revealAll?: boolean;
}) {
  const { revealAll: searchReveals } = useRibbonList();
  const settings = useSettings();
  const rowLimit = stagePreviewRowsSetting(settings.values?.stagePreviewRows);
  // Only the stages: a placement reload or an open editor is no reason to
  // partition again.
  const lookup = useAtomValue(ribbonStageLookupAtom);
  const stageOf = lookup?.stageOf;
  const bands = useMemo(
    () => stageOf ? stageBands(items, stageOf) : null,
    [items, stageOf],
  );
  if (bands === null) return <>{renderMain(items)}</>;
  const rows = (band: readonly ProjectThreadItem[]) =>
    band.map((item) => ({ id: itemThread(item)?.id ?? getSidebarItemKey(item), item }));
  // A selected descendant keeps its whole root in view within the preview.
  const selectedRootId =
    selectedThreadId === undefined
      ? null
      : (rows([...bands.deferred, ...bands.completed]).find(({ item }) =>
          projectThreadItemContainsThread(item, selectedThreadId),
        )?.id ?? null);
  return (
    <>
      {bands.main.length > 0 ? renderMain(bands.main) : null}
      <StagePreview
        stage="deferred"
        rowLimit={rowLimit}
        rows={rows(bands.deferred)}
        selectedRootId={selectedRootId}
        renderRow={({ id, item }) => <Fragment key={id}>{renderItem(item)}</Fragment>}
        revealAll={revealAll || searchReveals}
      />
      <StagePreview
        stage="completed"
        rowLimit={rowLimit}
        rows={rows(bands.completed)}
        selectedRootId={selectedRootId}
        renderRow={({ id, item }) => <Fragment key={id}>{renderItem(item)}</Fragment>}
        revealAll={revealAll || searchReveals}
      />
    </>
  );
}
