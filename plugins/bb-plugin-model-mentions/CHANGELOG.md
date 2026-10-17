# bb-plugin-model-mentions

## 0.2.2

### Patch Changes

- b86fd18: Add light and dark README screenshots showing model selection, a title
  generated from an issue-link conversation, and rich Markdown instructions.
  Keep the screenshot assets out of installed plugin packages.

## 0.2.1

### Patch Changes

- 3079970: Require bb 0.46.0 and Plugin SDK 0.6.37, with matching registry components
  and the Thread list fork. Thread stages uses bb's shared menu and hover-action
  registry, including other plugins' actions, and gains optional grouping by
  read status and an inline row-action editor. Preserve Ribbon's stage bands,
  section placement ranks, saved prompt editor, empty hover-action and hidden provider-icon defaults, and opaque sticky parent backgrounds. Narrow rows keep overflow hover actions in the menu so saved prompts and PR numbers stay in place.
  
  Missing keyboard shortcuts uses public navigation for new threads and terminal
  opening; bb now owns terminal tab creation and selection.

## 0.2.0

### Minor Changes

- 56c1e14: Add Model mentions: type a model name after `@` to choose from live provider
  catalogs and insert a chip with the provider's icon. Mentions carry the exact
  provider and model IDs as task instructions while leaving composer pickers
  unchanged. Provider and supported reasoning-level mentions are opt-in settings.
  Use `@model:` to browse available models, or add a model or provider name
  after the prefix to narrow the results.
  Prefer providers named in the query regardless of word order; scoped queries
  preserve that ordering in the shared mention menu.
