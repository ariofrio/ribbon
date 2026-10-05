---
"bb-plugin-thread-stages": major
---

The CLI is now `bb thread-stages`, named after the plugin, instead of
`bb sidebar`; its commands are unchanged. Scripts that call `bb sidebar` must
switch. The skill lists every layout preference, warns that
`bb thread-list prefs` changes bb's built-in list rather than this sidebar,
and has its evals back.
