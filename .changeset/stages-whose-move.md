---
"bb-plugin-ribbon-sidebar": minor
"bb-plugin-thread-stages": minor
---

Rename the Idle stage to Active and split Blocked into Blocked on other agent, marked with a bot, and Blocked on third party, marked with an incoming arrow. Waiting on the user is Active, so agents no longer file a thread as Blocked after asking the user something. On upgrade, Idle threads become Active and Blocked threads become Blocked on third party. A new shortcut files a thread as Blocked on other agent (⌃⌥⌘. on macOS, Ctrl+Alt+Shift+. elsewhere), and **Enable Blocked stages** turns both Blocked stages on or off. Stage mentions follow the new names, and `@Idle` and `@Blocked` in older messages still resolve.
