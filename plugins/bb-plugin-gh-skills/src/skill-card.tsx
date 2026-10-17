import type { ReactNode } from "react";
import { UrlLink } from "@get-bb/plugin-sdk/app";
import { Icon } from "@/vendor/components/ui/icon";
import { ResourceBrowseCard, ResourceBrowseGrid, ResourceIconFrame } from "@/vendor/components/ui/resource-list";

export function SkillGrid({ children }: { children: ReactNode }) {
  return <ResourceBrowseGrid className="w-full grid-cols-[repeat(auto-fill,minmax(min(100%,18rem),1fr))] gap-2">{children}</ResourceBrowseGrid>;
}

export function SkillCard({ name, description, source, sourceUrl, action, onOpen }: {
  name: string; description: ReactNode; source: ReactNode; sourceUrl?: string; action: ReactNode; onOpen: () => void;
}) {
  return <ResourceBrowseCard
    className="h-full min-h-36 grid-cols-[minmax(0,1fr)_0px] gap-x-0 gap-y-2 rounded-xl p-3"
    leading={<ResourceIconFrame className="size-6 rounded border border-border bg-muted/40 text-muted-foreground">{() => <Icon name="Layers" className="size-4" />}</ResourceIconFrame>}
    leadingClassName="size-6" title={<span className="line-clamp-2 whitespace-normal">{name}</span>}
    description={<span className="block min-h-[2lh]">{description}</span>}
    openLabel={`Open ${name}`} onOpen={onOpen}
    footer={<div className="flex min-w-0 items-center justify-between gap-2 border-t border-border/60 pt-2 text-xs text-subtle-foreground">
      <span className="min-w-0 truncate">{sourceUrl ? <UrlLink href={sourceUrl} className="pointer-events-auto relative z-10 rounded-sm underline-offset-2 hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring">{source}</UrlLink> : source}</span><span className="pointer-events-auto shrink-0">{action}</span>
    </div>}
  />;
}
