---
"bb-plugin-ribbon-sidebar": patch
---

Create threads from bb's New thread UI in the Project, Section, or writable
provider group selected in Ribbon. Forks inherit Section and provider-group
placement from the nearest thread on the fork source's ancestor chain.
Unparented threads inherit from their former parent chain. Reparenting writes
no placement, so the thread inherits from its new parent. Non-fork CLI threads
use each grouping's default group.
