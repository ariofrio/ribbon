import {
  closestCenter,
  DndContext,
  DragOverlay,
  KeyboardSensor,
  MouseSensor,
  pointerWithin,
  TouchSensor,
  useDroppable,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragMoveEvent,
  type Modifier,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
} from "@dnd-kit/sortable";
import { getEventCoordinates } from "@dnd-kit/utilities";
import { createPortal } from "react-dom";
import { usePortalScopeProps } from "./vendor/lib/portal-scope";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentProps,
  type ReactNode,
} from "react";

export type ThreadDragGroup =
  { kind: "pinned" } | { kind: "placement"; groupId: string };
export type ThreadDragTarget = ThreadDragGroup & {
  threadId?: string;
  atStart?: boolean;
  roots: readonly { id: string }[];
};
export type ThreadDragDestination = ThreadDragGroup & {
  beforeThreadId: string | null;
  atStart?: boolean;
  indicatorBefore: string | null;
  indicatorAfter: string | null;
};

const collisionDetection: CollisionDetection = (args) => {
  const headers = args.droppableContainers.filter(
    (container) => container.data.current?.target?.atStart,
  );
  const candidates = args.droppableContainers.filter(
    (container) => !container.data.current?.target?.atStart,
  );
  if (!args.pointerCoordinates)
    return closestCenter({ ...args, droppableContainers: candidates });
  // Sticky headers move independently of the rows scrolling underneath them.
  const headerRects = new Map(args.droppableRects);
  for (const header of headers) {
    const node = header.node.current;
    if (!node) continue;
    const rect = node.getBoundingClientRect();
    const group = node.closest("section");
    const firstRow = Array.from(
      group?.querySelectorAll<HTMLElement>("li[data-thread-id]") ?? [],
    ).find((row) => row.dataset.threadId !== String(args.active.id));
    // Include the leading spacing and any preview before the first visible row.
    const bottom = Math.max(
      rect.bottom,
      firstRow?.getBoundingClientRect().top ??
        group?.getBoundingClientRect().bottom ??
        rect.bottom,
    );
    headerRects.set(header.id, {
      top: rect.top,
      bottom,
      left: rect.left,
      right: rect.right,
      width: rect.width,
      height: bottom - rect.top,
    });
  }
  const headerHits = pointerWithin({
    ...args,
    droppableContainers: headers,
    droppableRects: headerRects,
  });
  if (headerHits.length) return headerHits;
  const hits = pointerWithin({ ...args, droppableContainers: candidates });
  const rows = hits.filter(
    ({ id }) =>
      candidates.find((candidate) => candidate.id === id)?.data.current?.target
        ?.threadId,
  );
  if (rows.length) return rows;
  if (hits.length) return hits;

  const groups = candidates
    .flatMap(({ id, data, node }) => {
      const target = data.current?.target;
      const rect = node.current?.getBoundingClientRect();
      return target && !target.threadId && rect ? [{ id, rect }] : [];
    })
    .sort((a, b) => a.rect.top - b.rect.top);
  const { x, y } = args.pointerCoordinates;
  for (let index = 0; index < groups.length - 1; index++) {
    const group = groups[index]!;
    const rect = group.rect;
    const nextRect = groups[index + 1]!.rect;
    if (
      x >= rect.left &&
      x <= rect.right &&
      y >= rect.bottom &&
      y < nextRect.top
    ) {
      return [{ id: group.id }];
    }
  }
  return [];
};

// Match bb's title chip: retain the original row rect when its preview changes layout.
function snapChipToCursor(): Modifier {
  let origin: { left: number; top: number } | null = null;
  return ({
    active,
    activeNodeRect,
    draggingNodeRect,
    activatorEvent,
    transform,
  }) => {
    if (!active) {
      origin = null;
      return transform;
    }
    origin ??= activeNodeRect;
    const coordinates = activatorEvent && getEventCoordinates(activatorEvent);
    if (!origin || !draggingNodeRect || !coordinates) return transform;
    return {
      ...transform,
      x: transform.x + coordinates.x - origin.left - draggingNodeRect.width / 2,
      y: transform.y + coordinates.y - origin.top - draggingNodeRect.height / 2,
    };
  };
}

export function ThreadDropPreview() {
  return (
    <div
      aria-hidden="true"
      data-ribbon-thread-drop-preview=""
      className="pointer-events-none flex h-[var(--bb-sidebar-row-height)] w-full items-center rounded-md border border-dashed border-sidebar-border bg-sidebar-accent/40 max-md:pointer-coarse:h-[var(--bb-sidebar-row-height-coarse)]"
    />
  );
}

export function ThreadDragGroup({
  target,
  disabled,
  children,
  ...props
}: Omit<ComponentProps<"section">, "ref"> & {
  target: ThreadDragTarget;
  disabled: boolean;
}) {
  const id =
    target.kind === "pinned" ? "pinned" : `placement:${target.groupId}`;
  const { setNodeRef } = useDroppable({ id, disabled, data: { target } });
  return (
    <section {...props} ref={setNodeRef}>
      <SortableContext items={target.roots.map(({ id }) => id)}>
        {children}
      </SortableContext>
    </section>
  );
}

export function ThreadDragHeader({
  target,
  disabled,
  ...props
}: ComponentProps<"div"> & {
  target: ThreadDragTarget;
  disabled: boolean;
}) {
  const groupId =
    target.kind === "pinned" ? "pinned" : `placement:${target.groupId}`;
  const { setNodeRef } = useDroppable({
    id: `header:${groupId}`,
    disabled,
    data: { target: { ...target, atStart: true } },
  });
  return <div {...props} ref={setNodeRef} />;
}

export function ThreadDragProvider({
  children,
  canDrop,
  onStart,
  onDestination,
  onDrop,
  onCancel,
}: {
  children: ReactNode;
  canDrop(sourceId: string, target: ThreadDragGroup): boolean;
  onStart(id: string): void;
  onDestination(destination: ThreadDragDestination | null): void;
  onDrop(id: string, destination: ThreadDragDestination): void;
  onCancel(): void;
}) {
  const [label, setLabel] = useState<string | null>(null);
  const suppressed = useRef(false);
  const resetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const destination = useRef<ThreadDragDestination | null>(null);
  const portalScopeProps = usePortalScopeProps();
  const modifiers = useMemo(() => [snapChipToCursor()], []);
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 200, tolerance: 6 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );
  useEffect(() => {
    const suppressClick = (event: MouseEvent) => {
      if (!suppressed.current) return;
      suppressed.current = false;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
    };
    document.addEventListener("click", suppressClick, true);
    return () => {
      document.removeEventListener("click", suppressClick, true);
      if (resetTimer.current) clearTimeout(resetTimer.current);
      delete document.body.dataset.sidebarDragging;
    };
  }, []);

  function finish() {
    setLabel(null);
    delete document.body.dataset.sidebarDragging;
    resetTimer.current = setTimeout(() => {
      suppressed.current = false;
    }, 350);
  }
  function move(event: DragMoveEvent) {
    const sourceId = String(event.active.id);
    const target = event.over?.data.current?.target as
      ThreadDragTarget | undefined;
    let next: ThreadDragDestination | null = null;
    if (target && canDrop(sourceId, target)) {
      const roots = target.roots.filter(({ id }) => id !== sourceId);
      const index = roots.findIndex(({ id }) => id === target.threadId);
      const coordinates = getEventCoordinates(event.activatorEvent);
      const y = coordinates
        ? coordinates.y + event.delta.y
        : event.active.rect.current.translated?.top;
      const after = coordinates
        ? y !== undefined &&
          event.over &&
          y > event.over.rect.top + event.over.rect.height / 2
        : event.delta.y > 0;
      const atSource = target.threadId === sourceId;
      const beforeThreadId = atSource
        ? (target.roots[target.roots.findIndex(({ id }) => id === sourceId) + 1]
            ?.id ?? null)
        : target.atStart
          ? (roots[0]?.id ?? null)
          : index < 0
            ? null
            : after
              ? (roots[index + 1]?.id ?? null)
              : target.threadId!;
      next = {
        ...(target.kind === "pinned"
          ? { kind: "pinned" as const }
          : { kind: "placement" as const, groupId: target.groupId }),
        beforeThreadId,
        ...(target.atStart ? { atStart: true } : {}),
        indicatorBefore:
          atSource || (index >= 0 && !after) ? target.threadId! : null,
        indicatorAfter:
          !atSource && index >= 0 && after ? target.threadId! : null,
      };
    }
    destination.current = next;
    onDestination(next);
  }
  return (
    <DndContext
      sensors={sensors}
      collisionDetection={collisionDetection}
      onDragStart={({ active }) => {
        if (resetTimer.current) clearTimeout(resetTimer.current);
        suppressed.current = true;
        document.body.dataset.sidebarDragging = "true";
        destination.current = null;
        setLabel(active.data.current?.label ?? "Untitled thread");
        onStart(String(active.id));
      }}
      onDragMove={move}
      onDragOver={move}
      onDragCancel={() => {
        finish();
        destination.current = null;
        onCancel();
      }}
      onDragEnd={({ active }) => {
        finish();
        const target = destination.current;
        destination.current = null;
        const source = active.data.current?.target as
          ThreadDragTarget | undefined;
        const nextThreadId =
          source?.roots[
            source.roots.findIndex(({ id }) => id === active.id) + 1
          ]?.id ?? null;
        if (
          source &&
          target &&
          source.kind === target.kind &&
          (source.kind === "pinned" ||
            (target.kind === "placement" &&
              source.groupId === target.groupId)) &&
          target.beforeThreadId === nextThreadId
        ) {
          onCancel();
          return;
        }
        if (target && canDrop(String(active.id), target))
          onDrop(String(active.id), target);
        else onCancel();
      }}
    >
      <div
        className="contents"
        onClickCapture={(event) => {
          if (!suppressed.current) return;
          event.preventDefault();
          event.stopPropagation();
          suppressed.current = false;
        }}
      >
        {children}
      </div>
      {createPortal(
        <DragOverlay dropAnimation={null} modifiers={modifiers}>
          {label !== null ? (
            <div
              {...portalScopeProps}
              aria-hidden="true"
              data-ribbon-thread-drag-overlay=""
              className="pointer-events-none flex h-[var(--bb-sidebar-row-height)] w-fit max-w-56 items-center gap-2 rounded-md bg-sidebar-accent px-2 text-sm text-sidebar-accent-foreground shadow-sm ring-1 ring-sidebar-border max-md:pointer-coarse:h-[var(--bb-sidebar-row-height-coarse)]"
            >
              <span className="min-w-0 flex-1 truncate">{label}</span>
            </div>
          ) : null}
        </DragOverlay>,
        document.body,
      )}
    </DndContext>
  );
}
