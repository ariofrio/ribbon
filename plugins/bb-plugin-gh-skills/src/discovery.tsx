import { useEffect, useState, type ReactNode } from "react";
import { useRpc } from "@get-bb/plugin-sdk/app";
import { ResourceListState, ResourceSourceShelf, ResourceShelfSeeAllAction } from "@/vendor/components/ui/resource-list";
import { SkillGrid } from "./skill-card";
import type { SearchSkill, rpcContract } from "./contract";

type Shelf = { skills: SearchSkill[]; fetchedAt: number };
const cache = new Map<string, Shelf>();
const topics = [{ label: "Code review", query: "review" }, { label: "Writing", query: "writing" }];

export function DiscoveryShelves({ owner, renderSkill, onSearch }: { owner: string; renderSkill: (skill: SearchSkill) => ReactNode; onSearch: (query: string) => void }) {
  return <div data-gh-skills-discovery className="space-y-6 [--resource-source-shelf-header-inset:calc(var(--spacing)*3)] [--resource-source-shelf-inset:0px]">{topics.map((topic) => <DiscoveryShelf key={`${owner}:${topic.query}`} {...topic} owner={owner} renderSkill={renderSkill} onSearch={onSearch} />)}</div>;
}

function DiscoveryShelf({ label, query, owner, renderSkill, onSearch }: { label: string; query: string; owner: string; renderSkill: (skill: SearchSkill) => ReactNode; onSearch: (query: string) => void }) {
  const rpc = useRpc<typeof rpcContract>();
  const key = `${owner.trim()}:${query}`;
  const [shelf, setShelf] = useState(cache.get(key));
  const [error, setError] = useState<string>();
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!attempt && shelf && Date.now() - shelf.fetchedAt < 5 * 60_000) return;
    let current = true;
    setError(undefined);
    void rpc.call("skills.search", { query, ...(owner.trim() ? { owner: owner.trim() } : {}), limit: 3 }).then((result) => {
      if (!current) return;
      const next = { skills: result.skills, fetchedAt: Date.now() };
      cache.delete(key); cache.set(key, next);
      if (cache.size > 20) cache.delete(cache.keys().next().value!);
      setShelf(next);
    }).catch((cause) => { if (current) setError(cause instanceof Error ? cause.message : String(cause)); });
    return () => { current = false; };
  }, [rpc, query, owner, key, attempt]);
  return <ResourceSourceShelf label={label} description={`Skills matching “${query}” on GitHub${owner.trim() ? ` from ${owner.trim()}` : ""}.`}
    browseAction={<ResourceShelfSeeAllAction aria-label={`See all ${label.toLowerCase()} skills`} onClick={() => onSearch(query)} />}>
    {error && <ResourceListState state="error" message={error} onRetry={() => setAttempt((old) => old + 1)} />}
    {shelf ? shelf.skills.length ? <SkillGrid>{shelf.skills.map(renderSkill)}</SkillGrid> : <ResourceListState state="empty" message={`No ${label.toLowerCase()} skills found.`} /> : !error && <ResourceListState state="loading" message={`Finding ${label.toLowerCase()} skills…`} />}
  </ResourceSourceShelf>;
}
