import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { definePluginApp, Markdown, UrlLink, useBbNavigate, useRealtime, useRpc, type PluginNavPanelProps, type PluginRpcResult } from "@get-bb/plugin-sdk/app";
import { Badge } from "@/vendor/components/ui/badge";
import { Button } from "@/vendor/components/ui/button";
import { Input } from "@/vendor/components/ui/input";
import { Checkbox } from "@/vendor/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/vendor/components/ui/popover";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/vendor/components/ui/dialog";
import { ConfirmDeleteDialog, ConfirmDeleteDialogContent } from "@/vendor/components/ui/confirm-delete-dialog";
import { ResourceCollectionPage, ResourceCollectionViewport, ResourceControlButton, ResourceDetailPage, ResourceDetailOverviewSection, ResourceDefinitionSection, ResourceDetailReleaseSection, ResourceInstalledControl, ResourceInstallControl, ResourceListState, ResourceOverflowMenu, ResourceToolbar, ResourceSortMenu } from "@/vendor/components/ui/resource-list";
import type { InstalledSkill, SearchSkill, SkillOperation, SkillUpdateCheck, rpcContract } from "./contract";
import { repositoryInput } from "./repository";
import { SkillCard, SkillGrid } from "./skill-card";
import { SkillsSidebar } from "./sidebar";
import { cachedSearch, cacheSearch, searchKey, useCollectionScroll, useCollectionState } from "./collection-state";
import { DiscoveryShelves } from "./discovery";
import { toast } from "sonner";

const band = "mx-auto w-full max-w-5xl px-4 md:px-5";
const message = (cause: unknown) => cause instanceof Error ? cause.message : String(cause);
const decode = (value: string) => { try { return decodeURIComponent(value); } catch { return value; } };

type InstallDraft = { repository: string; skill: string; pin: string; all: boolean; force: boolean; allowHidden: boolean };
const emptyDraft: InstallDraft = { repository: "", skill: "", pin: "", all: false, force: false, allowHidden: false };
type SkillDocument = { title: string; content: string; plain?: boolean; cliOutput?: string; sourcePath?: string; ref?: string; description?: string };
const previewDocument = (title: string, result: PluginRpcResult<(typeof rpcContract)["skills.preview"]>): SkillDocument => ({ title, ...result, content: result.content ?? result.output, plain: result.content === undefined, cliOutput: result.content === undefined ? undefined : result.output });
function Instructions({ document }: { document: SkillDocument }) {
  return <>{document.plain ? <pre className="whitespace-pre-wrap break-words text-sm">{document.content}</pre> : <Markdown content={document.content} />}
    {document.cliOutput && <details className="mt-4 text-sm"><summary className="cursor-pointer text-muted-foreground">GitHub CLI preview</summary><pre className="mt-2 overflow-auto whitespace-pre-wrap break-words text-xs">{document.cliOutput}</pre></details>}</>;
}

function SkillsPage({ subPath }: PluginNavPanelProps) {
  const rpc = useRpc<typeof rpcContract>();
  const navigate = useBbNavigate();
  const mode = subPath.startsWith("installed") ? "installed" : "browse";
  const [sidebarAvailable, setSidebarAvailable] = useState(false);
  const goToPage = useCallback((page: "browse" | "installed") => navigate.toPluginPanel("skills", { subPath: page }), [navigate]);
  const detailId = subPath.startsWith("installed/") ? decode(subPath.slice("installed/".length)) : undefined;
  const parts = subPath.split("/");
  const previewRepository = mode === "browse" && parts.length >= 4 ? `${decode(parts[1]!)}/${decode(parts[2]!)}` : undefined;
  const previewSkill = previewRepository ? parts.slice(3).map(decode).join("/") : undefined;
  const isDetail = Boolean(detailId || previewRepository);
  const { query, owner, descending, setQuery, setOwner, setDescending } = useCollectionState(mode, isDetail);
  const installedQuery = query;
  const setInstalledQuery = setQuery;
  const resultKey = searchKey(query, owner);
  const initialSearch = cachedSearch(resultKey);
  const [inventory, setInventory] = useState<{ directory: string; skills: InstalledSkill[] }>();
  const [inventoryError, setInventoryError] = useState<string>();
  const [error, setError] = useState<string>();
  const [working, setWorking] = useState(false);
  const [operation, setOperation] = useState<SkillOperation | null>(null);
  const [operationError, setOperationError] = useState<string>();
  const [dismissedOperation, setDismissedOperation] = useState<string>();
  const operationGeneration = useRef(0);
  const busy = working || operation?.state === "running";
  const [installing, setInstalling] = useState<string>();
  const [output, setOutput] = useState("");
  const [checkOpen, setCheckOpen] = useState(false);
  const [updateCheck, setUpdateCheck] = useState<SkillUpdateCheck>();
  const [checking, setChecking] = useState(false);
  const [checkError, setCheckError] = useState<string>();
  const checkGeneration = useRef(0);
  const [installOpen, setInstallOpen] = useState(false);
  const [draft, setDraft] = useState<InstallDraft>(emptyDraft);
  const [repositoryError, setRepositoryError] = useState<string>();
  const [document, setDocument] = useState<SkillDocument>();
  const [installPreview, setInstallPreview] = useState<SkillDocument>();
  const [discovered, setDiscovered] = useState<PluginRpcResult<(typeof rpcContract)["skills.discover"]>>();
  const [formAction, setFormAction] = useState<string>();
  const [documentError, setDocumentError] = useState<string>();
  const [detailAttempt, setDetailAttempt] = useState(0);
  const [removing, setRemoving] = useState<InstalledSkill>();
  const [updating, setUpdating] = useState<InstalledSkill | "all">();
  const [results, setResults] = useState<SearchSkill[] | undefined>(initialSearch?.skills);
  const [page, setPage] = useState(initialSearch?.page ?? 1);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string>();
  const [hasMore, setHasMore] = useState(initialSearch?.hasMore ?? false);
  const searchGeneration = useRef(0);
  const requests = useRef(new Set<string>());
  const loadMore = useRef<HTMLDivElement>(null);
  const viewport = useCollectionScroll(`${mode}:${resultKey}`, isDetail, mode === "browse" ? results : inventory);
  const [force, setForce] = useState(false);
  const [unpin, setUnpin] = useState(false);
  useEffect(() => { setDiscovered(undefined); setInstallPreview(undefined); }, [draft.repository, draft.pin, draft.allowHidden]);
  useEffect(() => { setInstallPreview(undefined); }, [draft.skill]);
  const refreshOperation = useCallback(async () => {
    const generation = ++operationGeneration.current;
    try {
      const next = await rpc.call("skills.operation", null);
      if (generation !== operationGeneration.current) return;
      setOperation(next); setOperationError(undefined); if (next?.output) setOutput(next.output);
    } catch (cause) { if (generation === operationGeneration.current) setOperationError(message(cause)); }
  }, [rpc]);
  useEffect(() => { void refreshOperation(); }, [refreshOperation]);
  useRealtime("skills.operation", () => { void refreshOperation(); });
  const refresh = useCallback(async () => {
    try { setInventory(await rpc.call("skills.list", null)); setInventoryError(undefined); }
    catch (cause) { setInventoryError(message(cause)); }
  }, [rpc]);
  useEffect(() => { void refresh(); }, [refresh]);
  useRealtime("skills.changed", () => { void refresh(); });
  const checkUpdates = useCallback(async (force = false) => {
    const generation = ++checkGeneration.current;
    setChecking(true); setCheckError(undefined);
    try { const result = await rpc.call("skills.check", { force }); if (generation === checkGeneration.current) setUpdateCheck(result); }
    catch (cause) { if (generation === checkGeneration.current) setCheckError(message(cause)); }
    finally { if (generation === checkGeneration.current) setChecking(false); }
  }, [rpc]);
  useEffect(() => {
    if (mode !== "installed" || !inventory?.skills.length || busy) { checkGeneration.current++; setChecking(false); return; }
    void checkUpdates();
    return () => { checkGeneration.current++; };
  }, [mode, inventory, busy, checkUpdates]);
  useEffect(() => {
    setDocument(undefined);
    setDocumentError(undefined);
    if (!detailId && !previewRepository) return;
    let current = true;
    const request = detailId ? rpc.call("skills.read", { id: detailId }).then((result) => ({ title: detailId, content: result.content }))
      : rpc.call("skills.preview", { repository: previewRepository!, skill: previewSkill!, allowHidden: false }).then((result) => previewDocument(previewSkill!, result));
    void request.then((result) => {
      if (current) setDocument(result);
    }).catch((cause) => { if (current) setDocumentError(message(cause)); });
    return () => { current = false; };
  }, [rpc, detailId, previewRepository, previewSkill, detailAttempt, detailId ? inventory : undefined]);
  async function perform(action: () => Promise<void>, formAction?: string) {
    if (busy) return false;
    setWorking(true); setError(undefined); setFormAction(formAction);
    try { await action(); return true; }
    catch (cause) { setError(message(cause)); return false; }
    finally { await refreshOperation(); setWorking(false); setFormAction(undefined); }
  }
  async function install(event: FormEvent) {
    event.preventDefault();
    const repository = validateRepository();
    if (!repository) return;
    setInstallOpen(false);
    const succeeded = await perform(async () => {
      const result = await rpc.call("skills.install", {
        repository, all: draft.all, force: draft.force, allowHidden: draft.allowHidden,
        ...(!draft.all ? { skill: draft.skill.trim() } : {}), ...(draft.pin.trim() ? { pin: draft.pin.trim() } : {}),
      });
      setOutput(result.output); setInstallOpen(false); toast.success("Skill installed"); await refresh();
    }, "install");
    if (!succeeded) setInstallOpen(true);
  }
  function validateRepository() {
    const result = repositoryInput.safeParse(draft.repository);
    setRepositoryError(result.success ? undefined : result.error.issues[0]?.message);
    return result.success ? result.data : undefined;
  }
  const edit = <K extends keyof InstallDraft>(key: K, value: InstallDraft[K]) => setDraft((old) => ({ ...old, [key]: value }));
  const openInstalled = (skill: InstalledSkill) => navigate.toPluginPanel("skills", { subPath: `installed/${skill.id}` });
  async function update(id?: string) {
    const target = updating;
    setUpdating(undefined);
    const succeeded = await perform(async () => {
      const result = await rpc.call("skills.update", { ...(id ? { id } : { all: true }), ...(force ? { force } : {}), ...(unpin ? { unpin } : {}) });
      setOutput(result.output); setUpdateCheck(undefined);
      toast.success("Skill update finished"); await refresh();
    });
    if (!succeeded) setUpdating(target);
  }
  const search = useCallback(async (nextPage: number, generation: number) => {
    const requestKey = `${generation}:${nextPage}`;
    if (requests.current.has(requestKey)) return;
    requests.current.add(requestKey);
    setSearching(true); setSearchError(undefined);
    try {
      const result = await rpc.call("skills.search", { query: query.trim(), ...(owner.trim() ? { owner: owner.trim() } : {}), page: nextPage });
      if (generation !== searchGeneration.current) return;
      const old = cachedSearch(resultKey)?.skills ?? [];
      const skills = nextPage === 1 ? result.skills : [...old, ...result.skills.filter((entry) => !old.some((item) => item.repo === entry.repo && item.path === entry.path))];
      const hasMore = result.skills.length === 20 && nextPage < 100 && (nextPage === 1 || skills.length > old.length);
      cacheSearch(resultKey, { skills, page: nextPage, hasMore, fetchedAt: Date.now() });
      setResults(skills); setPage(nextPage); setHasMore(hasMore);
    } catch (cause) { if (generation === searchGeneration.current) setSearchError(message(cause)); }
    finally { requests.current.delete(requestKey); if (generation === searchGeneration.current) setSearching(false); }
  }, [rpc, query, owner, resultKey]);
  useEffect(() => {
    const generation = ++searchGeneration.current;
    if (mode !== "browse" || isDetail) return;
    const cached = cachedSearch(resultKey);
    setResults(cached?.skills); setPage(cached?.page ?? 1); setHasMore(cached?.hasMore ?? false); setSearchError(undefined); setSearching(false);
    if (query.trim().length < 2) return;
    if (cached && Date.now() - cached.fetchedAt < 5 * 60_000) return;
    const timeout = setTimeout(() => void search(1, generation), 300);
    return () => { clearTimeout(timeout); searchGeneration.current++; };
  }, [search, mode, isDetail, query, resultKey]);
  useEffect(() => {
    if (mode !== "browse" || isDetail || !hasMore || searching || searchError || !loadMore.current || !window.IntersectionObserver) return;
    const observer = new IntersectionObserver((entries) => { if (entries.some((entry) => entry.isIntersecting)) void search(page + 1, searchGeneration.current); }, { root: viewport.current });
    observer.observe(loadMore.current);
    return () => observer.disconnect();
  }, [mode, isDetail, hasMore, searching, searchError, page, search, viewport]);
  const installedResult = (skill: SearchSkill) => inventory?.skills.find((entry) =>
    entry.sourceURL.replace(/\/$/u, "").toLowerCase() === `https://github.com/${skill.repo}`.toLowerCase() && entry.skillName === (skill.namespace ? `${skill.namespace}/${skill.skillName}` : skill.skillName));
  const pendingInstall = (skill: SearchSkill) => installing === `${skill.repo}/${skill.path}` || (operation?.state === "running" && operation.kind === "install" && operation.repository?.toLowerCase() === skill.repo.toLowerCase() && [skill.repo, skill.path, skill.path.replace(/\/SKILL\.md$/u, ""), skill.namespace ? `${skill.namespace}/${skill.skillName}` : skill.skillName].includes(operation.target));
  const installResult = (skill: SearchSkill) => void perform(async () => {
    setInstalling(`${skill.repo}/${skill.path}`);
    try {
      const result = await rpc.call("skills.install", { repository: skill.repo, skill: skill.path });
      setOutput(result.output); toast.success(`${skill.skillName} installed`); await refresh();
    } finally { setInstalling(undefined); }
  });
  const searchCard = (skill: SearchSkill) => <SkillCard key={`${skill.repo}/${skill.path}`} name={skill.skillName} source={skill.repo} sourceUrl={`https://github.com/${skill.repo}`}
    description={skill.description} onOpen={() => navigate.toPluginPanel("skills", { subPath: `browse/${skill.repo}/${skill.path}` })}
    action={installedResult(skill) ? <ResourceInstalledControl accessibleLabel={`${skill.skillName} is installed`} /> : <ResourceInstallControl accessibleLabel={`Install ${skill.skillName}`} disabled={busy} pending={pendingInstall(skill)} onAction={() => installResult(skill)} />} />;
  const preview = (repository: string, skill: string, allowHidden = false) => void perform(async () => {
    const result = await rpc.call("skills.preview", { repository, skill, allowHidden });
    setInstallPreview(previewDocument(skill, result));
  }, "preview");
  const visibleSkills = inventory?.skills.filter((skill) => [skill.skillName, skill.description, skill.sourceURL, skill.version].join(" ").toLowerCase().includes(installedQuery.trim().toLowerCase()))
    .sort((left, right) => left.skillName.localeCompare(right.skillName) * (descending ? -1 : 1));
  const openUpdate = (target: InstalledSkill | "all") => { setError(undefined); setForce(false); setUnpin(false); setUpdating(target); };
  const availableUpdate = (skill: InstalledSkill) => updateCheck?.updates.find((entry) => entry.skillName === skill.skillName && skill.sourceURL.replace(/\/$/u, "").toLowerCase() === `https://github.com/${entry.repository}`.toLowerCase());
  const skillActions = (skill: InstalledSkill) => <ResourceOverflowMenu label={`Actions for ${skill.skillName}`} disabled={busy} items={[
    { label: "Update", icon: "Download", disabled: !repositoryInput.safeParse(skill.sourceURL).success, disabledReason: !repositoryInput.safeParse(skill.sourceURL).success ? "No GitHub source metadata" : undefined, onSelect: () => openUpdate(skill) },
    { kind: "separator" },
    { label: "Uninstall", icon: "Trash2", tone: "destructive", onSelect: () => { setError(undefined); setRemoving(skill); } },
  ]} />;
  const actions = <>
    <Button disabled={busy} onClick={() => { setError(undefined); setRepositoryError(undefined); setDraft(emptyDraft); setInstallOpen(true); }}>Install skill</Button>
    <ResourceOverflowMenu label="Skill actions" disabled={busy} items={[
      { label: "Refresh", icon: "RefreshCw", onSelect: () => void refresh() },
      { label: "Check for updates", icon: "Download", disabled: !inventory?.skills.length, onSelect: () => { setCheckOpen(true); void checkUpdates(true); } },
      { label: "Update all", icon: "Download", disabled: !inventory?.skills.length, onSelect: () => openUpdate("all") },
    ]} />
  </>;
  const previewEntry = previewRepository && previewSkill ? results?.find((skill) => skill.repo === previewRepository && skill.path === previewSkill) ?? {
    repo: previewRepository, path: previewSkill, skillName: previewSkill.split("/").filter((part) => part !== "SKILL.md").at(-1) ?? previewSkill, namespace: "", description: "", stars: 0,
  } : undefined;
  const detailSkill = inventory?.skills.find((skill) => skill.id === detailId) ?? (previewEntry ? installedResult(previewEntry) : undefined);
  return (
    <section data-gh-skills className="flex h-full min-h-0 flex-col" aria-label="Managed server skills">
      <SkillsSidebar mode={mode} onNavigate={goToPage} onAvailable={setSidebarAvailable} />
      {inventory && inventoryError && <div role="alert" className={`${band} py-3 text-sm text-destructive`}>Couldn’t refresh skills: {inventoryError} <Button variant="ghost" size="sm" onClick={() => void refresh()}>Retry inventory</Button></div>}
      {operationError && <div role="alert" className={`${band} py-3 text-sm text-destructive`}>Couldn’t load skill operation status. <Button variant="ghost" size="sm" onClick={() => void refreshOperation()}>Retry status</Button></div>}
      {operation?.state === "running" && <p role="status" className={`${band} py-3 text-sm text-muted-foreground`}>{({ install: "Installing", update: "Updating", check: "Checking", remove: "Uninstalling" })[operation.kind]} {operation.target} on the BB server…</p>}
      {operation?.state === "failed" && operation.id !== dismissedOperation && !installOpen && !updating && !removing && <div role="alert" className={`${band} flex items-start justify-between gap-2 py-3 text-sm text-destructive`}><span>{operation.error}</span><Button variant="ghost" size="sm" onClick={() => setDismissedOperation(operation.id)}>Dismiss</Button></div>}
      {isDetail ? <div className="h-full overflow-auto p-4 md:p-5">
        <div className="mx-auto mb-5 max-w-3xl"><Button variant="ghost" onClick={() => navigate.toPluginPanel("skills", { subPath: mode })}>{detailId ? "Back to installed skills" : "Back to browse"}</Button></div>
        <ResourceDetailPage title={detailSkill?.skillName ?? detailId ?? previewEntry?.skillName}
          titleMeta={detailSkill?.version} lifecycleControl={detailSkill ? <ResourceInstalledControl accessibleLabel={`${detailSkill.skillName} is installed`} /> : previewEntry ? <ResourceInstallControl accessibleLabel="Install skill" disabled={busy} pending={pendingInstall(previewEntry)} onAction={() => installResult(previewEntry)} /> : undefined}
          overflowMenu={detailSkill ? skillActions(detailSkill) : undefined}
          metadata={detailSkill?.sourceURL || previewRepository || "No source metadata"}>
          <ResourceDetailOverviewSection label="Overview">{documentError ? <ResourceListState state="error" message={documentError} onRetry={() => setDetailAttempt((value) => value + 1)} />
            : document ? <Instructions document={document} /> : <ResourceListState state="loading" message="Loading skill…" />}</ResourceDetailOverviewSection>
          <ResourceDefinitionSection label="Source"><dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-5 gap-y-3 text-sm">
            <dt className="text-muted-foreground">Repository</dt><dd className="min-w-0 break-words">{detailSkill?.sourceURL?.startsWith("https://") || previewRepository ? <UrlLink href={detailSkill?.sourceURL || `https://github.com/${previewRepository}`} className="underline underline-offset-2">{detailSkill?.sourceURL || previewRepository}</UrlLink> : "No GitHub source metadata"}</dd>
            {(detailSkill?.sourcePath || document?.sourcePath) && <><dt className="text-muted-foreground">Skill path</dt><dd className="min-w-0 break-words font-mono text-xs">{detailSkill?.sourcePath || document?.sourcePath}</dd></>}
            {(detailSkill?.version || document?.ref) && <><dt className="text-muted-foreground">Reference</dt><dd className="min-w-0 break-words">{detailSkill?.version || document?.ref}{detailSkill?.pinned && <Badge variant="secondary" className="ml-2">Pinned</Badge>}</dd></>}
          </dl></ResourceDefinitionSection>
          {detailSkill && <ResourceDetailReleaseSection label="Updates" actions={<Button variant="ghost" size="sm" disabled={busy || checking} onClick={() => void checkUpdates(true)}>Check for updates</Button>}>
            {checking ? <p role="status" className="text-sm text-muted-foreground">Checking for updates…</p> : checkError ? <ResourceListState state="error" message={checkError} onRetry={() => void checkUpdates(true)} /> : availableUpdate(detailSkill) ? <div className="flex flex-wrap items-center justify-between gap-3 text-sm"><span className="min-w-0 break-words">Update available: {availableUpdate(detailSkill)!.to} ({availableUpdate(detailSkill)!.ref})</span><Button disabled={busy} onClick={() => openUpdate(detailSkill)}>Update skill</Button></div> : <p className="text-sm text-muted-foreground">{detailSkill.pinned ? "Pinned skills are skipped by ordinary updates." : updateCheck ? "No update reported. Open the check details for skipped skills or warnings." : "Update status has not been checked."}</p>}
            {updateCheck?.output && <details className="mt-3 text-sm"><summary className="cursor-pointer text-muted-foreground">Update check details</summary><pre className="mt-2 overflow-auto whitespace-pre-wrap break-words text-xs">{updateCheck.output}</pre></details>}
          </ResourceDetailReleaseSection>}
        </ResourceDetailPage>
      </div> :
      <ResourceCollectionPage id="gh-skills" bandClassName={band}
        description="Install and manage skills shared across projects and connected machines."
        modes={sidebarAvailable ? [] : [{ id: "browse", label: "Browse" }, { id: "installed", label: "Installed", count: inventory?.skills.length }]}
        activeMode={mode} onModeChange={goToPage}
        >
        <ResourceCollectionViewport viewportRef={viewport} bandClassName={band} toolbar={<ResourceToolbar
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
            {working && operation?.state !== "running" && <p role="status" className="text-sm text-muted-foreground">Running on the BB server…</p>}
            {error && operation?.state !== "failed" && !installOpen && !removing && !updating && <div role="alert" className="rounded-lg border border-destructive/30 p-3 text-sm text-destructive">{error}</div>}
            {mode === "installed" && checking && <p role="status" className="text-sm text-muted-foreground">Checking for updates…</p>}
            {mode === "installed" && checkError && <ResourceListState state="error" message={`Couldn’t check for updates: ${checkError}`} onRetry={() => void checkUpdates(true)} />}
            {output && <details className="rounded-lg border border-border p-3"><summary className="cursor-pointer text-sm font-medium">Last operation details</summary><pre role="status" className="mt-2 overflow-auto whitespace-pre-wrap break-words text-xs">{output}</pre></details>}
            {mode === "browse" ? <>
              {query.trim().length < 2 ? <><p className="text-sm text-muted-foreground">{query.trim() ? "Enter at least two characters to search GitHub." : "Discover skills below, search GitHub, or install directly from a repository."}</p><DiscoveryShelves owner={owner} renderSkill={searchCard} onSearch={setQuery} /></> : <>
              {searchError && <ResourceListState state="error" message={searchError} onRetry={() => void search(1, searchGeneration.current)} />}
              {searching && <p role="status" className="text-sm text-muted-foreground">Searching GitHub…</p>}
              {results === undefined && !searchError ? <ResourceListState state={searching ? "loading" : "empty"} message={searching ? "Searching GitHub…" : "Search GitHub to find skills. Enter at least two characters, or install directly from a repository."} />
                : results === undefined ? null
                : results.length === 0 ? <ResourceListState state="empty" message="No matching skills" />
                : <SkillGrid>{results.map(searchCard)}</SkillGrid>}
              {results && hasMore && <div ref={loadMore} data-gh-skills-load-more className="flex justify-center"><Button variant="ghost" disabled={searching} onClick={() => void search(page + 1, searchGeneration.current)}>Load more</Button></div>}
              </>}
            </> : <>
            {!inventory ? <ResourceListState state={inventoryError ? "error" : "loading"} message={inventoryError ?? "Loading skills…"} onRetry={() => void refresh()} />
              : inventory.skills.length === 0 ? <ResourceListState state="empty" message="No skills installed" />
              : visibleSkills?.length === 0 ? <ResourceListState state="empty" message={`No skills match "${installedQuery}".`} />
              : <SkillGrid>{visibleSkills?.map((skill) => <SkillCard key={skill.id} name={skill.skillName}
                description={skill.description || "No description provided."}
                source={skill.sourceURL.replace("https://github.com/", "") || "No source metadata"} sourceUrl={skill.sourceURL.startsWith("https://") ? skill.sourceURL : undefined} onOpen={() => openInstalled(skill)}
                meta={<>{skill.version && <span className="truncate text-xs font-normal text-muted-foreground">{skill.version}</span>}{skill.pinned && <Badge variant="secondary">Pinned</Badge>}</>}
                action={<span className="flex items-center gap-1">{availableUpdate(skill) && <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" disabled={busy} aria-label={`Update ${skill.skillName}`} onClick={() => openUpdate(skill)}>Update</Button>}{skillActions(skill)}</span>} />)}</SkillGrid>}
            </>}
          </div>
        </ResourceCollectionViewport>
      </ResourceCollectionPage>
      }
      <Dialog open={checkOpen} onOpenChange={setCheckOpen}>
        <DialogContent><DialogHeader><DialogTitle>Skill update check</DialogTitle><DialogDescription>Available updates reported by GitHub CLI.</DialogDescription></DialogHeader>
          {checking ? <p role="status" className="text-sm text-muted-foreground">Checking for updates…</p> : checkError ? <ResourceListState state="error" message={checkError} onRetry={() => void checkUpdates(true)} /> : <>
            {updateCheck?.updates.length ? <ul className="space-y-2 text-sm">{updateCheck.updates.map((entry) => <li key={`${entry.repository}/${entry.skillName}`}><span className="font-medium">{entry.skillName}</span> · {entry.from} → {entry.to} ({entry.ref})</li>)}</ul> : <p className="text-sm text-muted-foreground">Check finished. See the details for skipped skills or warnings.</p>}
            <details className="text-sm"><summary className="cursor-pointer text-muted-foreground">GitHub CLI details</summary><pre className="mt-2 max-h-[50vh] overflow-auto whitespace-pre-wrap break-words text-xs">{updateCheck?.output}</pre></details>
          </>}
          <DialogFooter><Button variant="outline" onClick={() => setCheckOpen(false)}>Done</Button></DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={Boolean(updating)} onOpenChange={(open) => { if (!open && !busy) setUpdating(undefined); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>{updating === "all" ? "Update all skills?" : `Update ${updating?.skillName ?? "skill"}?`}</DialogTitle>
            <DialogDescription>{updating === "all" ? "Update installed skills from their GitHub sources. Ordinary updates skip pinned skills." : `Currently ${updating?.version || "an unrecorded version"}. GitHub CLI selects the update from this skill’s source.`}</DialogDescription></DialogHeader>
          {updating && updating !== "all" && updating.pinned && <p className="text-sm text-muted-foreground">This skill is pinned. Include pinned skills below to remove its pin and update it.</p>}
          {updating && updating !== "all" && availableUpdate(updating) && <p className="break-words text-sm">Available: {availableUpdate(updating)!.to} ({availableUpdate(updating)!.ref})</p>}
          {updating === "all" && updateCheck && <p className="text-sm">{updateCheck.updates.length} update(s) reported by the latest check.</p>}
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
        <DialogContent className="max-h-[85dvh] overflow-y-auto">
          <DialogHeader><DialogTitle>Install skill</DialogTitle><DialogDescription>Install from GitHub into the BB server’s skills directory.</DialogDescription></DialogHeader>
          <form onSubmit={(event) => void install(event)} className="space-y-4">
            <label className="grid gap-1.5 text-sm">Repository<Input autoFocus placeholder="https://github.com/owner/repo" value={draft.repository} disabled={busy} aria-invalid={Boolean(repositoryError)} aria-describedby={repositoryError ? "skill-repository-error" : undefined} onChange={(event) => { edit("repository", event.target.value); setRepositoryError(undefined); }} required /></label>
            {repositoryError && <p id="skill-repository-error" role="alert" className="text-sm text-destructive">{repositoryError}</p>}
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
              <Button type="button" variant="outline" disabled={busy || !draft.repository.trim()} onClick={() => { const repository = validateRepository(); if (repository) void perform(async () => {
                setDiscovered(await rpc.call("skills.discover", { repository, ...(draft.pin.trim() ? { pin: draft.pin.trim() } : {}), allowHidden: draft.allowHidden }));
              }, "discover"); }}>{formAction === "discover" ? "Finding skills…" : "List repository skills"}</Button>
              <Button type="button" variant="outline" disabled={busy || !draft.repository.trim() || !draft.skill.trim() || draft.all} onClick={() => { const repository = validateRepository(); if (repository) preview(repository, draft.skill.trim() + (draft.pin.trim() ? `@${draft.pin.trim()}` : ""), draft.allowHidden); }}>{formAction === "preview" ? "Loading preview…" : "Preview"}</Button>
            </div>
            {discovered && <section aria-label="Repository skills" className="space-y-2">
              <div className="max-h-52 overflow-y-auto rounded-md border border-border">{discovered.skills.map((skill) => <Button key={skill.name} type="button" variant="ghost" aria-label={`Use ${skill.name}`} aria-pressed={draft.skill === skill.name} disabled={busy || draft.all} className="h-auto w-full justify-start whitespace-normal rounded-none px-3 py-2 text-left aria-pressed:bg-state-active" onClick={() => edit("skill", skill.name)}><span className="grid gap-1"><span>{skill.name}</span><span className="text-xs font-normal text-muted-foreground">{skill.description}</span></span></Button>)}</div>
              <details className="text-xs text-muted-foreground"><summary className="cursor-pointer">Repository listing details</summary><pre className="mt-2 whitespace-pre-wrap break-words">{discovered.output}</pre></details>
            </section>}
            {installPreview && <section aria-label="Skill preview" className="max-h-72 overflow-y-auto rounded-lg border border-border p-3"><Instructions document={installPreview} /></section>}
            {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
            <DialogFooter><Button type="button" variant="outline" disabled={busy} onClick={() => setInstallOpen(false)}>Cancel</Button><Button type="submit" disabled={busy}>{formAction === "install" ? "Installing…" : "Install"}</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <ConfirmDeleteDialog open={Boolean(removing)} onOpenChange={(open) => { if (!open && !busy) setRemoving(undefined); }}>
        <ConfirmDeleteDialogContent title={`Uninstall ${removing?.skillName ?? "skill"}?`}
          description="Delete this skill and its local files from the BB server. It will no longer be available to agents."
          confirmLabel={busy ? "Uninstalling…" : "Uninstall skill"} pending={busy}
          onCancel={() => setRemoving(undefined)} onConfirm={() => void perform(async () => {
            if (!removing) return;
            const result = await rpc.call("skills.remove", { id: removing.id });
            setOutput(result.output); setRemoving(undefined); toast.success("Skill uninstalled"); await refresh();
            if (detailId) navigate.toPluginPanel("skills", { subPath: "installed" });
          })} />
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      </ConfirmDeleteDialog>
    </section>
  );
}

export default definePluginApp((app) => {
  app.slots.navPanel({ id: "skills", title: "Skills", icon: "Layers", path: "skills", component: SkillsPage });
});
