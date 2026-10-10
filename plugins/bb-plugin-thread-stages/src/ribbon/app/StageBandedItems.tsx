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
import { RailContinuation, SiblingBand } from "./rails";

/**
 * A group's items in Ribbon's shape: the main list, then Deferred and
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
  depth = 0,
}: {
  items: readonly ProjectThreadItem[];
  selectedThreadId?: string;
  /** Renders the main band the way the list renders any run of items. */
  renderMain: (items: readonly ProjectThreadItem[]) => ReactNode;
  renderItem: (item: ProjectThreadItem, index: number, count: number) => ReactNode;
  revealAll?: boolean;
  depth?: number;
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
      {bands.main.length > 0 ? (
        <SiblingBand hasFollowing={bands.deferred.length + bands.completed.length > 0}>
          {renderMain(bands.main)}
        </SiblingBand>
      ) : null}
      <SiblingBand
        hasPrevious={bands.main.length > 0}
        hasFollowing={bands.completed.length > 0}
      >
        <StagePreview
          stage="deferred"
          depth={depth}
          rowLimit={rowLimit}
          rows={rows(bands.deferred)}
          selectedRootId={selectedRootId}
          renderRow={({ id, item }, index, count) => <Fragment key={id}>{renderItem(item, index, count)}</Fragment>}
          revealAll={revealAll || searchReveals}
          continuation={
            <RailContinuation
              depth={depth}
              tree={settings.values?.childThreadLines === "Tree"}
              continuesGroup={bands.completed.length > 0}
            />
          }
        />
      </SiblingBand>
      <SiblingBand hasPrevious={bands.main.length + bands.deferred.length > 0}>
        <StagePreview
          stage="completed"
          depth={depth}
          rowLimit={rowLimit}
          rows={rows(bands.completed)}
          selectedRootId={selectedRootId}
          renderRow={({ id, item }, index, count) => <Fragment key={id}>{renderItem(item, index, count)}</Fragment>}
          revealAll={revealAll || searchReveals}
          continuation={
            <RailContinuation
              depth={depth}
              tree={settings.values?.childThreadLines === "Tree"}
              continuesGroup={false}
            />
          }
        />
      </SiblingBand>
    </>
  );
}
