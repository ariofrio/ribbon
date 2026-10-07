# Ribbon on bb 0.45

Target: [bb 0.45.0](https://github.com/get-bb/bb/releases/tag/desktop-v0.45.0), Plugin SDK 0.6.15. Previous migrations: [bb 0.42.1 and public APIs](https://github.com/ariofrio/ribbon/pull/74), [bb 0.43.3 and public commands](https://github.com/ariofrio/ribbon/pull/76), and [bb 0.44.0](https://github.com/ariofrio/ribbon/pull/123).

## Coverage audit

All four plugin manifests and lockfiles use bb 0.45.0 and SDK 0.6.15; engine requirements, vendored UI, the fork pin, and the screenshot/E2E harness agree. Each plugin passed its own `release:check`. All four plugin changelogs and the prior migration histories were reviewed. Pending changesets cover the plugin changes; release automation generates the version bumps and changelog entries.

| Plugin | Applicable changes and result |
| --- | --- |
| [ChatGPT theme](https://github.com/ariofrio/ribbon/blob/6023cff1/plugins/bb-plugin-chatgpt-theme/package.json) | Version pins and package verification updated. It has no frontend SDK bundle or backend behavior to migrate. Its native-DOM styling remains coupled to bb’s markup; shared registry changes and both palette captures were checked in CI. |
| [Missing keyboard shortcuts](https://github.com/ariofrio/ribbon/blob/6023cff1/plugins/bb-plugin-missing-keyboard-shortcuts/src/app.tsx) | Migrated the composer handle and scope. Existing public navigation, RPC, ThreadChat, and commands still apply. `useComposers()` does not expose panel ownership, selected tab, visibility, or terminal focus. Composer commands deliberately suppress terminal/browser focus, so they cannot replace the global focus/toggle shortcuts. |
| [Thread stages](https://github.com/ariofrio/ribbon/blob/6023cff1/fork.json) | Synced the only fork declared in `fork.json`, including its owned-file review, and refreshed registry components. Migrated RPC adaptation; adopted public PR fallback, placement, hover controls and draft rollups. Preserved Ribbon stages, rails, prompt actions and richer GitHub detail. |
| [Thread titles](https://github.com/ariofrio/ribbon/blob/6023cff1/plugins/bb-plugin-thread-titles/src/app.tsx) | Updated provider-defined tiers and reviewed picker, worker spawn, title timing and AI-service selection. Corrected its settings text: Ribbon’s local Luna selection is independent of bb’s Automatic AI-service policy. |

### Release and source coverage

[0.45 release metadata](https://github.com/get-bb/bb/releases/tag/desktop-v0.45.0) contains only the release title, and the tagged [CHANGELOG.md](https://github.com/get-bb/bb/blob/desktop-v0.45.0/CHANGELOG.md) ends at 0.44. The detailed [0.45 notes](https://github.com/get-bb/bb/blob/98f1c988777612723cc198e776ef407e2b6836ea/CHANGELOG.md) were published after the tag in [upstream PR #4769](https://github.com/get-bb/bb/pull/4769). Those notes were checked against the release source, including navigation customization, provider controls, cloud AI, composer behavior and platform changes. The SDK has no separate changelog in the source tree.

The audit reviewed the complete 0.44 → 0.45 diffs for the SDK’s frontend, backend, RPC, provider bridge, README and [API inventory](https://github.com/get-bb/bb/compare/desktop-v0.44.0...desktop-v0.45.0), the SDK areas exposed through the plugin SDK, registry items, and the thread-list fork:

| Changed family | Decision |
| --- | --- |
| [Composer redesign, editing, selection, submission](https://github.com/get-bb/bb/blob/desktop-v0.45.0/packages/plugin-sdk/src/app-contract.ts#L2579) | Migrate the existing composer consumer. Insertion and scheduling remain proposed features. Runtime-only legacy aliases are not used as the new implementation. |
| [Composer discovery, popups, commands, message-action composer](https://github.com/get-bb/bb/blob/desktop-v0.45.0/packages/plugin-sdk/src/app-contract.ts#L1757) | Available for prompt history and draft actions; not a general panel controller. Existing Side chat message action creates and opens a separate child conversation rather than editing the source draft. |
| [PR normalized status and queue fields](https://github.com/get-bb/bb/blob/desktop-v0.45.0/packages/plugin-sdk/src/app-contract.ts#L1187) | Adopt fallback while retaining check counts and reviewer names. |
| [New-thread section/pin placement and upstream row/group behavior](https://github.com/get-bb/bb/blob/desktop-v0.45.0/packages/plugin-sdk/src/app-contract.ts#L1455) | Adopt through fork sync and Ribbon composition. |
| [Footer customization](https://github.com/get-bb/bb/blob/desktop-v0.45.0/apps/app/src/components/sidebar/SidebarFooterCustomize.tsx) and [per-tab sidebar width/open state](https://github.com/get-bb/bb/blob/desktop-v0.45.0/apps/app/src/components/layout/AppLayout.tsx#L132) | Inherited from the host; Ribbon replaces the thread list and leaves the native footer and outer sidebar layout in place. |
| [RPC caller context](https://github.com/get-bb/bb/blob/desktop-v0.45.0/packages/plugin-sdk/src/rpc-contract.ts#L88) | Adapt the placement handler; other handlers already ignore the extra argument. |
| [Open provider tiers](https://github.com/get-bb/bb/blob/desktop-v0.45.0/packages/plugin-sdk/src/backend-contract.ts#L1514) | Accept nonempty provider-defined strings end to end. |
| AI-service Automatic order / `automaticRank` | [Core now prefers bb cloud](https://github.com/get-bb/bb/blob/desktop-v0.45.0/apps/server/src/services/ai/ai-tasks.ts#L72), then other registered services. Fix misleading settings copy; preserve Ribbon’s explicit per-host model policy. |
| [Resolved icon precedence](https://github.com/get-bb/bb/blob/desktop-v0.45.0/docs/api_to_audit.md#L3504) | Retain explicit Side chat, project and row action icons; shared icon/rendering changes are covered by native parity and screenshot checks. |
| [Removed URL/Original/provider-registration/conformance aliases](https://github.com/get-bb/bb/blob/desktop-v0.45.0/docs/api_to_audit.md#L213) | No plugin uses the removed names. |
| [Portable provider spawning and static provider discovery/catalog](https://github.com/get-bb/bb/blob/desktop-v0.45.0/packages/plugin-sdk/src/provider-bridge.ts#L261) | No plugin registers or launches a provider bridge. Title workers use public thread spawning; native model picker handles provider selection. |
| [Mobile-only settings and mobile release/download APIs](https://github.com/get-bb/bb/blob/desktop-v0.45.0/packages/plugin-sdk/src/app-contract.ts#L678) | No Ribbon plugin supplies a mobile access provider; no migration. |
| [Host thread-storage paths and environment cleanup](https://github.com/get-bb/bb/blob/desktop-v0.45.0/packages/sdk/src/areas/hosts.ts#L94) | No replacement for current panel integrations; explicit environment cleanup would be a new feature, not a compatibility fix. |
| [Project file transport and section-list endpoint changes](https://github.com/get-bb/bb/blob/desktop-v0.45.0/packages/sdk/src/areas/projects.ts#L504) | Existing SDK calls inherit the transport update; no private route consumer to replace. |
| [Desktop browser control/profile semantics](https://github.com/get-bb/bb/blob/desktop-v0.45.0/docs/api_to_audit.md#L3120) | No browser integration in these plugins. |
| [Native platform, provider, question, task, performance and access changes](https://github.com/get-bb/bb/blob/98f1c988777612723cc198e776ef407e2b6836ea/CHANGELOG.md) | Host-owned behavior. Side chat delegates creation to the built-in plugin through public RPC; no fork-naming override, provider implementation, task draft store or server access configuration needs migrating in Ribbon. |
| [Global prompt history](https://github.com/get-bb/bb/blob/desktop-v0.45.0/packages/sdk/src/areas/prompt-history.ts) | Newly available and included in the prompt-history proposal. |

## Implemented in [PR #169](https://github.com/ariofrio/ribbon/pull/169)

- All four plugins, the isolated harness, shared UI, and Thread stages fork are pinned to the same release.
- [Composer integration](https://github.com/ariofrio/ribbon/blob/44c1d476/plugins/bb-plugin-missing-keyboard-shortcuts/src/app.tsx#L165) uses the current public handle after removal of the composer view hook.
- The [placement RPC adapter](https://github.com/ariofrio/ribbon/blob/44c1d476/plugins/bb-plugin-thread-stages/src/ribbon/server.ts#L950) handles the new caller-context argument without passing it as internal stage-announcement options.
- [Title generation](https://github.com/ariofrio/ribbon/blob/44c1d476/plugins/bb-plugin-thread-titles/src/server.ts#L63) accepts provider-defined service tiers, matching the native picker.
- The upstream thread-list merge preserves Ribbon’s stages, ordering, child rails, prompt actions, and compact menus.

## Available parity

- Configure up to three hover actions: split, copy link, read/unread, pin, move, rename, or archive. Ribbon defaults to an empty list so Completed remains its normal workflow. Hidden hover actions do not consume extra title space on touch screens.
- Update collapsed group draft indicators without rebuilding the thread tree for every keystroke.
- New threads inherit the originating group’s section and pin state through public creation placement.
- The [PR fallback](https://github.com/ariofrio/ribbon/blob/44c1d476/plugins/bb-plugin-thread-stages/src/ribbon/pull-request-status.ts#L71) uses public status fields when the richer GitHub lookup fails, including merge queues and auto-merge. Check counts and reviewer names still require the richer lookup.

## Proposed next work

1. **Prompt history picker.** A composer popup and rebindable composer command can browse global prompt history and insert a chosen prompt into the correct draft. The public [prompt-history API](https://github.com/get-bb/bb/blob/desktop-v0.45.0/docs/api_to_audit.md#L3681), [composer popups](https://github.com/get-bb/bb/blob/desktop-v0.45.0/docs/api_to_audit.md#L3), and [composer editing APIs](https://github.com/get-bb/bb/blob/desktop-v0.45.0/docs/api_to_audit.md#L3617) now supply the pieces.
2. **Draft a saved thread action before sending.** Offer a composer destination and insert the saved prompt for review, preserving the draft’s attachments and mentions. The public [composer contract](https://github.com/get-bb/bb/blob/desktop-v0.45.0/packages/plugin-sdk/src/app-contract.ts) includes composer discovery, structured insertion, and atomic replacement.
3. **Schedule a saved action.** A composer send-menu entry can use the host’s scheduling behavior through `composer.submit({ sendAt })`, keeping the selected provider and model. See the public [composer API contract](https://github.com/get-bb/bb/blob/desktop-v0.45.0/packages/plugin-sdk/src/app-contract.ts).
4. **Optional AI-service title refinement.** Offer bb’s selected title service alongside the current per-host provider/model selection, using the public AI-service API and its exposed automatic ranking. This would make following bb’s Automatic policy an explicit choice.

## Remaining SDK gaps

The 0.45 [public app contract](https://github.com/get-bb/bb/blob/desktop-v0.45.0/packages/plugin-sdk/src/app-contract.ts) has no general Terminal/Side chat tab-selection, visibility, and focus controller. Missing keyboard shortcuts therefore retains its panel DOM and storage integration. Public PR fields expose normalized states but omit check counts and requested reviewer names; replacing the richer lookup entirely would lose existing tooltip detail.

## Verification

1,071 automated tests passed (119 root, 821 Thread stages, 58 Missing keyboard shortcuts, 73 Thread titles). All 41 isolated UI cases passed across runs, including native PR icon parity and desktop/touch hover controls. SDK pins, typechecking, builds, stylesheet coverage, production builds, packed artifacts, layout, vendored UI, heading icons, and fork checks passed. CI owns the [screenshot recapture commit](https://github.com/ariofrio/ribbon/commit/f43641cfbc7a14f84adb8d4eb1e6faec1297dea3). All CI checks passed at `44c1d476`, including [plugin validation and the complete end-to-end suite](https://github.com/ariofrio/ribbon/actions/runs/37542383306), and [screenshot capture](https://github.com/ariofrio/ribbon/actions/runs/37542383307).

The follow-up title-policy correction at [`6023cff1`](https://github.com/ariofrio/ribbon/commit/6023cff1) passed all 73 title tests, its complete release check and isolated installation/E2E validation. All CI checks passed for that code revision, including [all four plugins and the full end-to-end suite](https://github.com/ariofrio/ribbon/actions/runs/37551362508), and [screenshot capture](https://github.com/ariofrio/ribbon/actions/runs/37551362438).

The reusable [project upgrade skill](../../.bb/skills/bb-upgrade/SKILL.md) is discoverable in this BB environment and passes frontmatter validation. Its audit fixture passed all nine coverage assertions in both Codex and Claude CLI runs while leaving the implementation unchanged. Both baseline runs also passed; this validates compatibility and coverage, without establishing a measured improvement over the baseline. Root tests and repository checks passed after adding the skill.
