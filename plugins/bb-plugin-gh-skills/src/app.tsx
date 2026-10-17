import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { definePluginApp, Markdown, useBbNavigate, useRealtime, useRpc, type PluginNavPanelProps } from "@get-bb/plugin-sdk/app";
import { Badge } from "@/vendor/components/ui/badge";
import { Button } from "@/vendor/components/ui/button";
import { Input } from "@/vendor/components/ui/input";
import { Checkbox } from "@/vendor/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/vendor/components/ui/popover";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/vendor/components/ui/dialog";
import { ConfirmDeleteDialog, ConfirmDeleteDialogContent } from "@/vendor/components/ui/confirm-delete-dialog";
import { ResourceCollectionPage, ResourceCollectionViewport, ResourceControlButton, ResourceDetailPage, ResourceDetailOverviewSection, ResourceInstalledControl, ResourceInstallControl, ResourceListState, ResourceOverflowMenu, ResourceToolbar, ResourceSortMenu } from "@/vendor/components/ui/resource-list";
import type { InstalledSkill, SearchSkill, rpcContract } from "./contract";
import { SkillCard, SkillGrid } from "./skill-card";
import { toast } from "sonner";

const band = "mx-auto w-full max-w-5xl px-4 md:px-5";
const message = (cause: unknown) => cause instanceof Error ? cause.message : String(cause);
const decode = (value: string) => { try { return decodeURIComponent(value); } catch { return value; } };

type InstallDraft = { repository: string; skill: string; pin: string; all: boolean; force: boolean; allowHidden: boolean };
const emptyDraft: InstallDraft = { repository: "", skill: "", pin: "", all: false, force: false, allowHidden: false };

function SkillsPage({ subPath }: PluginNavPanelProps) {
  const rpc = useRpc<typeof rpcContract>();
  const navigate = useBbNavigate();
  const mode = subPath.startsWith("browse") ? "browse" : "installed";
  const detailId = subPath.startsWith("installed/") ? decode(subPath.slice("installed/".length)) : undefined;
  const parts = subPath.split("/");
  const previewRepository = mode === "browse" && parts.length >= 4 ? `${decode(parts[1]!)}/${decode(parts[2]!)}` : undefined;
  const previewSkill = previewRepository ? parts.slice(3).map(decode).join("/") : undefined;
  const isDetail = Boolean(detailId || previewRepository);
  const [inventory, setInventory] = useState<{ directory: string; skills: InstalledSkill[] }>();
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [installing, setInstalling] = useState<string>();
  const [output, setOutput] = useState("");
  const [checkOpen, setCheckOpen] = useState(false);
  const [installOpen, setInstallOpen] = useState(false);
  const [draft, setDraft] = useState<InstallDraft>(emptyDraft);
  const [document, setDocument] = useState<{ title: string; content: string; plain?: boolean }>();
  const [detailAttempt, setDetailAttempt] = useState(0);
  const [removing, setRemoving] = useState<InstalledSkill>();
  const [updating, setUpdating] = useState<InstalledSkill | "all">();
  const [installedQuery, setInstalledQuery] = useState("");
  const [descending, setDescending] = useState(false);
  const [query, setQuery] = useState("");
  const [owner, setOwner] = useState("");
  const [results, setResults] = useState<SearchSkill[]>();
  const [page, setPage] = useState(1);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string>();
  const [hasMore, setHasMore] = useState(false);
  const searchGeneration = useRef(0);
  const [force, setForce] = useState(false);
  const [unpin, setUnpin] = useState(false);
  const refresh = useCallback(async () => {
    try { setInventory(await rpc.call("skills.list", null)); setError(undefined); }
    catch (cause) { setError(message(cause)); }
  }, [rpc]);
  useEffect(() => { void refresh(); }, [refresh]);
  useRealtime("skills.changed", () => { void refresh(); });
  useEffect(() => {
    setDocument(undefined);
    setError(undefined);
    if (!detailId && !previewRepository) return;
    let current = true;
    const request = detailId ? rpc.call("skills.read", { id: detailId }).then((result) => ({ title: detailId, content: result.content }))
      : rpc.call("skills.preview", { repository: previewRepository!, skill: previewSkill!, allowHidden: false }).then((result) => ({ title: previewSkill!, content: result.output, plain: true }));
    void request.then((result) => {
      if (current) setDocument(result);
    }).catch((cause) => { if (current) setError(message(cause)); });
    return () => { current = false; };
  }, [rpc, detailId, previewRepository, previewSkill, detailAttempt]);
  async function perform(action: () => Promise<void>) {
    if (busy) return;
    setBusy(true); setError(undefined);
    try { await action(); }
    catch (cause) { setError(message(cause)); }
    finally { setBusy(false); }
  }
  async function install(event: FormEvent) {
    event.preventDefault();
    await perform(async () => {
      const result = await rpc.call("skills.install", {
        repository: draft.repository.trim(), all: draft.all, force: draft.force, allowHidden: draft.allowHidden,
        ...(!draft.all ? { skill: draft.skill.trim() } : {}), ...(draft.pin.trim() ? { pin: draft.pin.trim() } : {}),
      });
      setOutput(result.output); setInstallOpen(false); toast.success("Skill installed"); await refresh();
    });
  }
  const edit = <K extends keyof InstallDraft>(key: K, value: InstallDraft[K]) => setDraft((old) => ({ ...old, [key]: value }));
  const openInstalled = (skill: InstalledSkill) => navigate.toPluginPanel("skills", { subPath: `installed/${skill.id}` });
  const update = (id?: string, dryRun = false) => void perform(async () => {
    const result = await rpc.call("skills.update", { ...(id ? { id } : { all: true }), ...(dryRun ? { dryRun: true } : {}), ...(!dryRun && force ? { force } : {}), ...(!dryRun && unpin ? { unpin } : {}) });
    setOutput(result.output || "No updates available.");
    if (dryRun) setCheckOpen(true);
    else { setUpdating(undefined); toast.success("Skill update finished"); await refresh(); }
  });
  const search = useCallback(async (nextPage: number, generation: number) => {
    setSearching(true); setSearchError(undefined);
    try {
      const result = await rpc.call("skills.search", { query: query.trim(), ...(owner.trim() ? { owner: owner.trim() } : {}), page: nextPage });
      if (generation !== searchGeneration.current) return;
      setResults((old) => nextPage === 1 ? result.skills : [...(old ?? []), ...result.skills.filter((entry) => !old?.some((item) => item.repo === entry.repo && item.path === entry.path))]); setPage(nextPage); setHasMore(result.skills.length === 20);
    } catch (cause) { if (generation === searchGeneration.current) setSearchError(message(cause)); }
    finally { if (generation === searchGeneration.current) setSearching(false); }
  }, [rpc, query, owner]);
  useEffect(() => {
    const generation = ++searchGeneration.current;
    if (mode !== "browse" || isDetail) return;
    setResults(undefined); setPage(1); setSearchError(undefined); setSearching(false);
    if (query.trim().length < 2) return;
    const timeout = setTimeout(() => void search(1, generation), 300);
    return () => { clearTimeout(timeout); searchGeneration.current++; };
  }, [search, mode, isDetail, query]);
  const installedResult = (skill: SearchSkill) => inventory?.skills.find((entry) =>
    entry.sourceURL.replace(/\/$/u, "").toLowerCase() === `https://github.com/${skill.repo}`.toLowerCase() && entry.skillName === (skill.namespace ? `${skill.namespace}/${skill.skillName}` : skill.skillName));
  const installResult = (skill: SearchSkill) => void perform(async () => {
    setInstalling(`${skill.repo}/${skill.path}`);
    try {
      const result = await rpc.call("skills.install", { repository: skill.repo, skill: skill.path });
      setOutput(result.output); toast.success(`${skill.skillName} installed`); await refresh();
    } finally { setInstalling(undefined); }
  });
  const preview = (repository: string, skill: string, allowHidden = false) => void perform(async () => {
    const result = await rpc.call("skills.preview", { repository, skill, allowHidden });
    setDocument({ title: skill, content: result.output, plain: true });
  });
  const visibleSkills = inventory?.skills.filter((skill) => [skill.skillName, skill.sourceURL, skill.version].join(" ").toLowerCase().includes(installedQuery.trim().toLowerCase()))
    .sort((left, right) => left.skillName.localeCompare(right.skillName) * (descending ? -1 : 1));
  const openUpdate = (target: InstalledSkill | "all") => { setError(undefined); setForce(false); setUnpin(false); setUpdating(target); };
  const skillActions = (skill: InstalledSkill) => <ResourceOverflowMenu label={`Actions for ${skill.skillName}`} disabled={busy} items={[
    { label: "Update", icon: "Download", disabled: !skill.sourceURL.startsWith("https://"), disabledReason: !skill.sourceURL.startsWith("https://") ? "No GitHub source metadata" : undefined, onSelect: () => openUpdate(skill) },
    { kind: "separator" },
    { label: "Uninstall", icon: "Trash2", tone: "destructive", onSelect: () => { setError(undefined); setRemoving(skill); } },
  ]} />;
  const actions = <>
    <Button disabled={busy} onClick={() => { setError(undefined); setDraft(emptyDraft); setInstallOpen(true); }}>Install skill</Button>
    <ResourceOverflowMenu label="Skill actions" disabled={busy} items={[
      { label: "Refresh", icon: "RefreshCw", onSelect: () => void refresh() },
      { label: "Check for updates", icon: "Download", disabled: !inventory?.skills.length, onSelect: () => update(undefined, true) },
      { label: "Update all", icon: "Download", disabled: !inventory?.skills.length, onSelect: () => openUpdate("all") },
    ]} />
  </>;
  const previewEntry = previewRepository && previewSkill ? results?.find((skill) => skill.repo === previewRepository && skill.path === previewSkill) ?? {
    repo: previewRepository, path: previewSkill, skillName: previewSkill.split("/").filter((part) => part !== "SKILL.md").at(-1) ?? previewSkill, namespace: "", description: "", stars: 0,
  } : undefined;
  const detailSkill = inventory?.skills.find((skill) => skill.id === detailId) ?? (previewEntry ? installedResult(previewEntry) : undefined);
  return (
    <section data-gh-skills className="flex h-full min-h-0 flex-col" aria-label="Managed server skills">
      {isDetail ? <div className="h-full overflow-auto p-4 md:p-5">
        <div className="mx-auto mb-5 max-w-3xl"><Button variant="ghost" onClick={() => navigate.toPluginPanel("skills", { subPath: mode })}>{detailId ? "Back to installed skills" : "Back to browse"}</Button></div>
        <ResourceDetailPage title={detailSkill?.skillName ?? detailId ?? previewEntry?.skillName}
          titleMeta={detailSkill?.version} lifecycleControl={detailSkill ? <ResourceInstalledControl accessibleLabel={`${detailSkill.skillName} is installed`} /> : previewEntry ? <ResourceInstallControl accessibleLabel="Install skill" disabled={busy} pending={Boolean(installing)} onAction={() => installResult(previewEntry)} /> : undefined}
          overflowMenu={detailSkill ? skillActions(detailSkill) : undefined}
          metadata={detailSkill?.sourceURL || previewRepository || "No source metadata"}>
          <ResourceDetailOverviewSection label="Overview">{error ? <ResourceListState state="error" message={error} onRetry={() => setDetailAttempt((value) => value + 1)} />
            : document ? document.plain ? <pre className="whitespace-pre-wrap break-words text-sm">{document.content}</pre> : <Markdown content={document.content} /> : <ResourceListState state="loading" message="Loading skill…" />}</ResourceDetailOverviewSection>
        </ResourceDetailPage>
      </div> :
      <ResourceCollectionPage id="gh-skills" bandClassName={band}
        description="Install and manage skills shared across projects and connected machines."
        modes={[{ id: "installed", label: "Installed", count: inventory?.skills.length }, { id: "browse", label: "Browse" }]}
        activeMode={mode} onModeChange={(next) => navigate.toPluginPanel("skills", { subPath: next })}
        >
        <ResourceCollectionViewport bandClassName={band} toolbar={<ResourceToolbar
          searchValue={mode === "installed" ? installedQuery : query} onSearchChange={mode === "installed" ? setInstalledQuery : setQuery}
          searchPlaceholder={mode === "installed" ? "Search installed skills" : "Search GitHub skills"} searchLabel={mode === "installed" ? "Search installed skills" : "Search GitHub skills"}
          controls={mode === "installed" ? <ResourceSortMenu value="name" direction={descending ? "desc" : "asc"} options={[{ id: "name", label: "Name" }]} onChange={() => setDescending(!descending)} compact /> : <Popover>
            <PopoverTrigger asChild><ResourceControlButton label="Filter by repository owner" icon="SlidersHorizontal" active={Boolean(owner.trim())} /></PopoverTrigger>
            <PopoverContent className="w-64" align="end"><label className="grid gap-2 text-sm">Repository owner<Input placeholder="Owner (optional)" value={owner} onChange={(event) => setOwner(event.target.value)} /></label>
              <Button className="mt-2" variant="ghost" size="sm" disabled={!owner} onClick={() => setOwner("")}>Clear filter</Button>
            </PopoverContent>
          </Popover>}
          action={<div className="flex items-center gap-1.5">{actions}</div>} compact expandSearchOnFocus
        />}>
          <div className={`${band} space-y-4`}>
            {busy && <p role="status" className="text-sm text-muted-foreground">Running on the BB server…</p>}
            {error && !installOpen && !removing && !updating && <div role="alert" className="rounded-lg border border-destructive/30 p-3 text-sm text-destructive">{error}</div>}
            {output && <details className="rounded-lg border border-border p-3"><summary className="cursor-pointer text-sm font-medium">Last operation details</summary><pre role="status" className="mt-2 overflow-auto whitespace-pre-wrap break-words text-xs">{output}</pre></details>}
            {mode === "browse" ? <>
              {searchError && <ResourceListState state="error" message={searchError} onRetry={() => void search(1, searchGeneration.current)} />}
              {searching && <p role="status" className="text-sm text-muted-foreground">Searching GitHub…</p>}
              {results === undefined && !searchError ? <ResourceListState state={searching ? "loading" : "empty"} message={searching ? "Searching GitHub…" : "Search GitHub to find skills. Enter at least two characters, or install directly from a repository."} />
                : results === undefined ? null
                : results.length === 0 ? <ResourceListState state="empty" message="No matching skills" />
                : <SkillGrid>{results.map((skill) => <SkillCard key={`${skill.repo}/${skill.path}`} name={skill.skillName} source={skill.repo} sourceUrl={`https://github.com/${skill.repo}`}
                  description={skill.description} onOpen={() => navigate.toPluginPanel("skills", { subPath: `browse/${skill.repo}/${skill.path}` })}
                  action={installedResult(skill) ? <ResourceInstalledControl accessibleLabel={`${skill.skillName} is installed`} /> : <ResourceInstallControl accessibleLabel={`Install ${skill.skillName}`} disabled={busy} pending={installing === `${skill.repo}/${skill.path}`} onAction={() => installResult(skill)} />} />)}</SkillGrid>}
              {results && hasMore && <div className="flex justify-center"><Button variant="ghost" disabled={searching} onClick={() => void search(page + 1, searchGeneration.current)}>Load more</Button></div>}
            </> : <>
            {!inventory ? <ResourceListState state={error ? "error" : "loading"} message={error ?? "Loading skills…"} onRetry={() => void refresh()} />
              : inventory.skills.length === 0 ? <ResourceListState state="empty" message="No skills installed" />
              : visibleSkills?.length === 0 ? <ResourceListState state="empty" message={`No skills match "${installedQuery}".`} />
              : <SkillGrid>{visibleSkills?.map((skill) => <SkillCard key={skill.id} name={skill.skillName}
                description={<>{skill.version || "Installed skill"}{skill.pinned && <> · <Badge variant="secondary">Pinned</Badge></>}</>}
                source={skill.sourceURL.replace("https://github.com/", "") || "No source metadata"} sourceUrl={skill.sourceURL.startsWith("https://") ? skill.sourceURL : undefined} onOpen={() => openInstalled(skill)}
                action={skillActions(skill)} />)}</SkillGrid>}
            </>}
          </div>
        </ResourceCollectionViewport>
      </ResourceCollectionPage>
      }
      <Dialog open={checkOpen} onOpenChange={setCheckOpen}>
        <DialogContent><DialogHeader><DialogTitle>Skill update check</DialogTitle><DialogDescription>Available updates reported by GitHub CLI.</DialogDescription></DialogHeader>
          <pre className="max-h-[60vh] overflow-auto whitespace-pre-wrap break-words text-sm">{output}</pre>
          <DialogFooter><Button variant="outline" onClick={() => setCheckOpen(false)}>Done</Button></DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={Boolean(updating)} onOpenChange={(open) => { if (!open && !busy) setUpdating(undefined); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>{updating === "all" ? "Update all skills?" : `Update ${updating?.skillName ?? "skill"}?`}</DialogTitle>
            <DialogDescription>{updating === "all" ? "Update installed skills from their GitHub sources. Ordinary updates skip pinned skills." : `Currently ${updating?.version || "an unrecorded version"}. GitHub CLI selects the update from this skill’s source.`}</DialogDescription></DialogHeader>
          {updating && updating !== "all" && updating.pinned && <p className="text-sm text-muted-foreground">This skill is pinned. Include pinned skills below to remove its pin and update it.</p>}
          <details className="text-sm"><summary className="cursor-pointer text-muted-foreground">Advanced options</summary><div className="mt-3 grid gap-3">
            <label className="flex items-center gap-2"><Checkbox checked={force} disabled={busy} onCheckedChange={(value) => setForce(value === true)} />Force re-download, overwriting local edits (--force)</label>
            <label className="flex items-center gap-2"><Checkbox checked={unpin} disabled={busy} onCheckedChange={(value) => setUnpin(value === true)} />Remove pins and include pinned skills (--unpin)</label>
          </div></details>
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          <DialogFooter><Button variant="outline" disabled={busy} onClick={() => setUpdating(undefined)}>Cancel</Button>
            <Button aria-busy={busy} disabled={busy || (updating !== "all" && updating?.pinned && !unpin)} onClick={() => update(updating === "all" ? undefined : updating?.id)}>{busy ? "Updating…" : updating === "all" ? "Update all skills" : "Update skill"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={installOpen} onOpenChange={(open) => { if (!busy) setInstallOpen(open); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Install skill</DialogTitle><DialogDescription>Install from GitHub into the BB server’s skills directory.</DialogDescription></DialogHeader>
          <form onSubmit={(event) => void install(event)} className="space-y-4">
            <label className="grid gap-1.5 text-sm">Repository<Input autoFocus placeholder="OWNER/REPO" value={draft.repository} disabled={busy} onChange={(event) => edit("repository", event.target.value)} required /></label>
            <label className="grid gap-1.5 text-sm">Skill name or path<Input placeholder="skills/my-skill" value={draft.skill} disabled={busy || draft.all} onChange={(event) => edit("skill", event.target.value)} required={!draft.all} /></label>
            <label className="grid gap-1.5 text-sm">Pin to tag, branch, or SHA<Input placeholder="Optional" value={draft.pin} disabled={busy} onChange={(event) => edit("pin", event.target.value)} /></label>
            <p className="text-xs text-muted-foreground">Pinned skills are skipped by ordinary updates. Without a pin, gh selects the latest release or default branch.</p>
            <div className="grid gap-3 text-sm">
              <label className="flex items-center gap-2"><Checkbox checked={draft.all} disabled={busy} onCheckedChange={(value) => edit("all", value === true)} />Install all skills in the repository</label>
              <details><summary className="cursor-pointer text-muted-foreground">Advanced options</summary><div className="mt-3 grid gap-3">
                <label className="flex items-center gap-2"><Checkbox checked={draft.force} disabled={busy} onCheckedChange={(value) => edit("force", value === true)} />Overwrite existing skills (--force)</label>
                <label className="flex items-center gap-2"><Checkbox checked={draft.allowHidden} disabled={busy} onCheckedChange={(value) => edit("allowHidden", value === true)} />Include hidden directories</label>
              </div></details>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" disabled={busy || !draft.repository.trim()} onClick={() => void perform(async () => {
                const result = await rpc.call("skills.discover", { repository: draft.repository.trim(), allowHidden: draft.allowHidden });
                setDocument({ title: "Repository skills", content: result.output, plain: true });
              })}>List repository skills</Button>
              <Button type="button" variant="outline" disabled={busy || !draft.repository.trim() || !draft.skill.trim() || draft.all} onClick={() => preview(draft.repository.trim(), draft.skill.trim() + (draft.pin.trim() ? `@${draft.pin.trim()}` : ""), draft.allowHidden)}>Preview</Button>
            </div>
            {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
            <DialogFooter><Button type="button" variant="outline" disabled={busy} onClick={() => setInstallOpen(false)}>Cancel</Button><Button type="submit" disabled={busy}>{busy ? "Installing…" : "Install"}</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <ConfirmDeleteDialog open={Boolean(removing)} onOpenChange={(open) => { if (!open && !busy) setRemoving(undefined); }}>
        <ConfirmDeleteDialogContent title={`Remove ${removing?.skillName ?? "skill"}?`}
          description="Delete this skill and its local files from the BB server. It will no longer be available to agents."
          confirmLabel={busy ? "Removing…" : "Remove skill"} pending={busy}
          onCancel={() => setRemoving(undefined)} onConfirm={() => void perform(async () => {
            if (!removing) return;
            const result = await rpc.call("skills.remove", { id: removing.id });
            setOutput(result.output); setRemoving(undefined); toast.success("Skill uninstalled"); await refresh();
            if (detailId) navigate.toPluginPanel("skills", { subPath: "installed" });
          })} />
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      </ConfirmDeleteDialog>
      <Dialog open={!isDetail && Boolean(document)} onOpenChange={(open) => { if (!open) setDocument(undefined); }}>
        <DialogContent className="max-w-3xl"><DialogHeader><DialogTitle>{document?.title}</DialogTitle><DialogDescription>{document?.plain ? "GitHub skill preview" : "Installed skill"}</DialogDescription></DialogHeader>
          <div className="max-h-[65vh] overflow-auto">{document && (document.plain ? <pre className="whitespace-pre-wrap break-words text-sm">{document.content}</pre> : <Markdown content={document.content} />)}</div>
        </DialogContent>
      </Dialog>
    </section>
  );
}

export default definePluginApp((app) => {
  app.slots.navPanel({ id: "skills", title: "Skills", icon: "Layers", path: "skills", component: SkillsPage });
});
