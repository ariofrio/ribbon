# bb-plugin-thread-titles

## 0.1.1

### Patch Changes

- ae26f2f: Assess the title once on the third user message after initial generation. Preserve changed titles, and keep accurate, specific titles instead of rewriting them for style. Only generic or inaccurate titles qualify for a replacement.
- ae26f2f: Generate a thread title after its first turn ends, using the full recorded conversation. Recover missed completion events across restarts and keep the one-update limit.
- 47a328f: Add one-time thread title refinement on the third user message, using the full recorded conversation and persistent restart-safe jobs. Preserve titles that differ from the initial baseline.
