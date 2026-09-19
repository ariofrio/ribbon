---
"bb-plugin-breadcrumbs": patch
"bb-plugin-chatgpt-theme": patch
"bb-plugin-icons": patch
"bb-plugin-missing-keyboard-shortcuts": patch
"bb-plugin-ribbon-sidebar": patch
"bb-plugin-thread-stages": patch
---

Update to bb 0.43.3 and Plugin SDK 0.4.104, including the matching UI components and runtime dependencies. This release requires bb 0.43.3 or newer.

Missing keyboard shortcuts and Thread stages now register their actions through bb's public command API. Their actions appear in the command palette, and their default shortcuts can be rebound or cleared in Keyboard settings.

The side-chat shortcut now opens a host-persisted plugin panel through the public command context and renders the fork through the public `ThreadChat` component.
