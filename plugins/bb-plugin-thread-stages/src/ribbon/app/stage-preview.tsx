import {
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { CHROME_SECTION_LABEL_CLASS } from "./chrome-style-tokens";
import { Button } from "@/components/ui/button";
import { DEFAULT_STAGE_PREVIEW_ROWS } from "../stage-preview-rows";
import { getSidebarThreadRowPaddingLeft } from "../../app/rows/sidebarRowClasses.js";

/** A flat continuation of section rows, with the current hierarchy kept visible. */
export function StagePreview<T extends { id: string }>({
  stage,
  rows,
  selectedRootId,
  renderRow,
  revealAll = false,
  rowLimit = DEFAULT_STAGE_PREVIEW_ROWS,
  depth = 0,
}: {
  stage: "deferred" | "completed";
  rows: readonly T[];
  selectedRootId: string | null;
  renderRow(row: T, index: number, count: number): ReactNode;
  revealAll?: boolean;
  rowLimit?: number;
  depth?: number;
}) {
  const [expanded, setExpanded] = useState(false);
  const list = useRef<HTMLUListElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const focusAfter = useRef<string | "button" | null>(null);
  const id = useId();
  const previewLimit =
    rows.length <= 1 || rows.length < rowLimit ? rows.length : rowLimit - 1;
  const selectedOutsidePreview =
    previewLimit > 0 &&
    rows.slice(previewLimit).some((row) => row.id === selectedRootId);
  const visible =
    expanded || revealAll
      ? rows
      : rows.filter(
          (row, index) =>
            index < previewLimit - Number(selectedOutsidePreview) ||
            (previewLimit > 0 && row.id === selectedRootId),
        );
  const hidden = rows.length - visible.length;
  useLayoutEffect(() => {
    const target = focusAfter.current;
    if (target === null) return;
    focusAfter.current = null;
    const element =
      target === "button"
        ? button.current
        : list.current?.querySelector<HTMLElement>(
            `[data-thread-id="${CSS.escape(target)}"] a`,
          );
    element?.focus({ preventScroll: true });
    element?.scrollIntoView({ block: "nearest" });
  }, [expanded]);
  if (rows.length === 0) return null;
  return (
    <>
      <ul className="space-y-px" id={id} ref={list}>
        {visible.map((row, index) => renderRow(row, index, visible.length))}
      </ul>
      {!revealAll &&
      (hidden > 0 || (expanded && rows.length > previewLimit)) ? (
        <Button
          ref={button}
          aria-controls={id}
          data-ribbon-fold-piece=""
          aria-expanded={expanded}
          className={`flex h-7 w-full justify-start rounded-md pl-8 pr-2 ${CHROME_SECTION_LABEL_CLASS} hover:bg-sidebar-accent hover:text-subtle-foreground/75 focus-visible:ring-sidebar-ring`}
          style={depth > 0 ? { paddingLeft: getSidebarThreadRowPaddingLeft(depth) + 24 } : undefined}
          size="sm"
          variant="ghost"
          type="button"
          onClick={(event) => {
            if (expanded) focusAfter.current = "button";
            else if (event.detail === 0)
              focusAfter.current =
                rows.find((row) => !visible.includes(row))?.id ?? null;
            setExpanded((value) => !value);
          }}
        >
          {expanded ? `Show fewer ${stage}` : `Show ${hidden} more ${stage}`}
        </Button>
      ) : null}
    </>
  );
}
