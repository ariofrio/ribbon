import {
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Button } from "./vendor/components/ui/button";

const PREVIEW_LIMIT = 2;

/** A flat continuation of section rows, with the current hierarchy kept visible. */
export function StagePreview<T extends { id: string }>({
  stage,
  rows,
  selectedRootId,
  renderRow,
  revealAll = false,
}: {
  stage: "deferred" | "completed";
  rows: readonly T[];
  selectedRootId: string | null;
  renderRow(row: T): ReactNode;
  revealAll?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const list = useRef<HTMLUListElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const focusAfter = useRef<string | "button" | null>(null);
  const id = useId();
  const visible =
    expanded || revealAll
      ? rows
      : rows.filter(
          (row, index) => index < PREVIEW_LIMIT || row.id === selectedRootId,
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
  return (
    <>
      <ul id={id} ref={list}>
        {visible.map(renderRow)}
      </ul>
      {!revealAll &&
      (hidden > 0 || (expanded && rows.length > PREVIEW_LIMIT)) ? (
        <Button
          ref={button}
          aria-controls={id}
          aria-expanded={expanded}
          className="h-7 w-full justify-start rounded-md pl-8 pr-2 text-xs font-normal text-subtle-foreground hover:text-sidebar-foreground focus-visible:ring-sidebar-ring"
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
