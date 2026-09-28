---
"bb-plugin-thread-titles": minor
---

Title the first message too. bb titles a new thread from the first 80 columns of its prompt, and its titles often run past 40 characters. Once bb has stored its title, or recorded that it generated none, a first pass replaces or keeps it using the whole first message and the title length limit. Because it waits for bb, the plugin's title is always the later write. The first-turn pass and the third-message assessment still follow, and a failed first-message pass no longer stops them.
