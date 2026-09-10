---
"bb-plugin-breadcrumbs": patch
"bb-plugin-chatgpt-theme": patch
"bb-plugin-icons": patch
"bb-plugin-missing-keyboard-shortcuts": patch
"bb-plugin-ribbon-sidebar": patch
"bb-plugin-thread-stages": patch
---

Update to bb 0.42.1 and Plugin SDK 0.4.47, including the matching UI components and runtime dependencies. This release requires bb 0.42.1 or newer.

Icons and keyboard shortcuts now use the public app-overlay slot and SDK RPC/settings hooks. The Side chat shortcut waits for bb's rich-text editor to mount before focusing it. Ribbon's top controls use the public sidebar-navigation slot, and its fallback uses the current `Original` API. Thread stages forwards placement changes through the SDK’s cross-plugin RPC client, uses SDK navigation, and accepts pending threads without treating them as active.
