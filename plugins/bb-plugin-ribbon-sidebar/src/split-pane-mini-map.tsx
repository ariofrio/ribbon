import type { PluginSidebarThreadSplit } from "@get-bb/plugin-sdk/app";

export function SplitPaneMiniMap({
  active,
  label,
  layout,
}: {
  active: boolean;
  label: string;
  layout: NonNullable<PluginSidebarThreadSplit["layout"]>;
}) {
  const focused = layout.panes.some((pane) => pane.isMe && pane.isFocused);
  return (
    <svg
      aria-label={label}
      className={`pointer-events-none size-3.5 shrink-0 ${
        focused ? "" : "opacity-60"
      } ${active ? "animate-shine-icon" : ""}`}
      height="14"
      role="img"
      shapeRendering="crispEdges"
      viewBox="0 0 14 14"
      width="14"
    >
      {layout.panes.map((pane) => {
        const inset = pane.isMe ? 0 : 0.5;
        return (
          <rect
            className={
              pane.isMe
                ? pane.isFocused
                  ? "fill-primary/70 stroke-none"
                  : "fill-muted-foreground/45 stroke-none"
                : "fill-none stroke-muted-foreground/30"
            }
            height={Math.max(pane.rect.height * 12 - inset * 2, 0)}
            key={pane.paneId}
            strokeWidth={pane.isMe ? 0 : 1}
            width={Math.max(pane.rect.width * 12 - inset * 2, 0)}
            x={1 + pane.rect.x * 12 + inset}
            y={1 + pane.rect.y * 12 + inset}
          />
        );
      })}
    </svg>
  );
}
