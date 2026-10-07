---
"bb-plugin-thread-stages": patch
---

Queue stage-change notices while a thread is busy instead of steering its active turn. Idle threads still start a turn when a notice arrives.
